import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import AdmZip from 'adm-zip';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, initializeDatabase } from './db.js';
import { seedPackagedBlogs, contentTypeFor } from './seed.js';

const app = express();
const PORT = Number(process.env.PORT || 10000);
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend');
const JWT_SECRET = process.env.JWT_SECRET;
const SITE_BASE_URL = process.env.SITE_BASE_URL || 'http://localhost:5500/';
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);

if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:', 'https:'] } }
}));
const corsForFrontend = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(Object.assign(new Error('Origen no autorizado.'), { status: 403 }));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/blog-files/')) {
    return cors({ origin: '*', methods: ['GET', 'OPTIONS'], maxAge: 600 })(req, res, next);
  }
  return corsForFrontend(req, res, next);
});
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw fail(401, 'Inicia sesión para continuar.');
    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'myblogs-api' });
    const result = await pool.query(
      'SELECT id,name,email,role,is_active FROM admins WHERE id=$1', [payload.sub]
    );
    const user = result.rows[0];
    if (!user || !user.is_active) throw fail(401, 'La sesión ya no está activa.');
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') error.status = 401;
    next(error);
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(fail(403, 'No tienes permiso para esta acción.'));
    next();
  };
}

function validSlug(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,220}$/.test(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function findHtmlElementByClass(html, classNames) {
  const wanted = new Set(classNames);
  const openTags = /<(header|div|footer)\b[^>]*>/gi;
  let opening;
  while ((opening = openTags.exec(html))) {
    const classes = opening[0].match(/\bclass=(['"])(.*?)\1/i)?.[2]?.split(/\s+/) || [];
    if (!classes.some(className => wanted.has(className))) continue;
    const tagName = opening[1];
    const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    tags.lastIndex = openTags.lastIndex;
    let depth = 1;
    let tag;
    while ((tag = tags.exec(html))) {
      if (new RegExp(`^<\\/${tagName}\\b`, 'i').test(tag[0])) depth -= 1;
      else if (!/\/>$/.test(tag[0])) depth += 1;
      if (!depth) return { start: opening.index, end: tags.lastIndex, tagName, html: html.slice(opening.index, tags.lastIndex) };
    }
  }
  return null;
}

function replaceHtmlElement(html, element, replacement) {
  return element ? `${html.slice(0, element.start)}${replacement}${html.slice(element.end)}` : html;
}

function findHtmlElementByTag(html, tagName) {
  const opening = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  if (!opening) return null;
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = opening.index + opening[0].length;
  let depth = 1;
  let tag;
  while ((tag = tags.exec(html))) {
    if (new RegExp(`^<\\/${tagName}\\b`, 'i').test(tag[0])) depth -= 1;
    else if (!/\/>$/.test(tag[0])) depth += 1;
    if (!depth) return { start: opening.index, end: tags.lastIndex, tagName, html: html.slice(opening.index, tags.lastIndex) };
  }
  return null;
}

function parseCategoryIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map(Number).filter(Number.isSafeInteger).filter(id => id > 0))];
  if (typeof value === 'string') {
    try { return parseCategoryIds(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function coverData(req, blog) {
  const apiBase = `${req.protocol}://${req.get('host')}`;
  const localPath = blog.local_cover_path;
  const localUrl = localPath
    ? `${apiBase}/api/blog-files/${encodeURIComponent(blog.slug)}/${localPath.split('/').map(encodeURIComponent).join('/')}`
    : '';
  const coverUrl = blog.cover_image || localUrl;
  return { cover_url: coverUrl, cover_fit: Boolean(localPath?.startsWith('assets/pages/')) };
}

function validOptionalHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch { return false; }
}

const allowedExtensions = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.gif',
  '.webp', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm', '.mp3', '.pdf', '.avif'
]);

function readZip(buffer) {
  let zip;
  try { zip = new AdmZip(buffer); } catch { throw fail(400, 'El archivo no parece ser un ZIP válido.'); }
  const entries = zip.getEntries();
  if (!entries.length || entries.length > 1000) throw fail(400, 'El ZIP debe tener entre 1 y 1000 archivos.');
  const files = [];
  let totalSize = 0;
  let hasRootIndex = false;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.replaceAll('\\', '/');
    const segments = name.split('/');
    if (!name || name.startsWith('/') || name.includes('\0') || segments.some(part => part === '..' || part === '.')) {
      throw fail(400, 'El ZIP contiene una ruta no permitida.');
    }
    const ext = path.posix.extname(name).toLowerCase();
    if (!allowedExtensions.has(ext)) throw fail(400, `Tipo de archivo no permitido: ${path.posix.basename(name)}.`);
    const data = entry.getData();
    totalSize += data.length;
    if (totalSize > 50 * 1024 * 1024) throw fail(400, 'El ZIP expandido no puede superar 50 MB.');
    if (name === 'index.html') hasRootIndex = true;
    files.push({ path: name, contentType: contentTypeFor(name), content: data, byteLength: data.length });
  }
  if (!hasRootIndex) throw fail(400, 'El ZIP debe incluir index.html en la carpeta principal.');
  return files;
}

async function saveBlogFiles(client, blogId, files) {
  for (const file of files) {
    await client.query(
      `INSERT INTO blog_files(blog_id,path,content_type,content,byte_length)
       VALUES($1,$2,$3,$4,$5)`,
      [blogId, file.path, file.contentType, file.content, file.byteLength]
    );
  }
}

async function syncBlogCategories(client, blogId, categoryIds) {
  await client.query('DELETE FROM blog_categories WHERE blog_id=$1', [blogId]);
  if (categoryIds.length) {
    await client.query(
      `INSERT INTO blog_categories(blog_id,category_id)
       SELECT $1,id FROM categories WHERE id=ANY($2::bigint[]) ON CONFLICT DO NOTHING`,
      [blogId, categoryIds]
    );
  }
}

async function blogRows(sql, params = []) {
  const result = await pool.query(
    `${sql.replace(/;\s*$/, '')}
     GROUP BY b.id
     ORDER BY b.is_featured DESC, COALESCE(b.published_at,b.created_at) DESC`, params
  );
  return result.rows;
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, service: 'myblogs-api' });
}));

app.post('/api/auth/login', loginLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw fail(400, 'Escribe tu correo y contraseña.');
  const result = await pool.query(
    'SELECT id,name,email,password_hash,role,is_active FROM admins WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !await bcrypt.compare(password, user.password_hash)) {
    throw fail(401, 'Correo o contraseña incorrectos.');
  }
  const token = jwt.sign({}, JWT_SECRET, { subject: String(user.id), issuer: 'myblogs-api', expiresIn: '4h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/categories', authenticate, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT c.id,c.name,c.slug,c.description,COUNT(bc.blog_id)::int AS blog_count
    FROM categories c LEFT JOIN blog_categories bc ON bc.category_id=c.id
    GROUP BY c.id ORDER BY c.name
  `);
  res.json({ categories: result.rows });
}));

app.get('/api/blogs', authenticate, asyncRoute(async (req, res) => {
  const search = String(req.query.q || '').trim();
  const categoryId = Number(req.query.category || 0);
  const clauses = ["b.status='published'"];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(b.title ILIKE $${params.length} OR b.description ILIKE $${params.length} OR b.author_name ILIKE $${params.length})`);
  }
  if (Number.isInteger(categoryId) && categoryId > 0) {
    params.push(categoryId);
    clauses.push(`EXISTS(SELECT 1 FROM blog_categories filter_bc WHERE filter_bc.blog_id=b.id AND filter_bc.category_id=$${params.length})`);
  }
  const blogs = await blogRows(`
    SELECT b.id,b.title,b.slug,b.description,b.author_name,b.source_platform,b.original_url,
      b.integration_mode,b.cover_image,b.status,b.is_featured,b.published_at,
      COALESCE(array_agg(DISTINCT c.name) FILTER(WHERE c.id IS NOT NULL),ARRAY[]::text[]) AS category_names,
      (SELECT f.path FROM blog_files f
       WHERE f.blog_id=b.id AND (f.path IN ('cover.svg','cover.jpg') OR (b.slug='algoritmos-bajo-sospecha' AND f.path='assets/pages/pagina-01.jpg'))
       ORDER BY CASE WHEN f.path='cover.svg' THEN 0 WHEN f.path='cover.jpg' THEN 1 ELSE 2 END LIMIT 1) AS local_cover_path
    FROM blogs b LEFT JOIN blog_categories bc ON bc.blog_id=b.id LEFT JOIN categories c ON c.id=bc.category_id
    WHERE ${clauses.join(' AND ')}`, params);
  res.json({ blogs: blogs.map(blog => ({ ...blog, ...coverData(req, blog) })) });
}));

app.get('/api/blogs/:slug', authenticate, asyncRoute(async (req, res) => {
  if (!validSlug(req.params.slug)) throw fail(400, 'Slug no válido.');
  const result = await blogRows(`
    SELECT b.id,b.title,b.slug,b.description,b.author_name,b.source_platform,b.original_url,
      b.integration_mode,b.cover_image,b.status,b.is_featured,b.published_at,
      (SELECT f.path FROM blog_files f
       WHERE f.blog_id=b.id AND (f.path IN ('cover.svg','cover.jpg') OR (b.slug='algoritmos-bajo-sospecha' AND f.path='assets/pages/pagina-01.jpg'))
       ORDER BY CASE WHEN f.path='cover.svg' THEN 0 WHEN f.path='cover.jpg' THEN 1 ELSE 2 END LIMIT 1) AS local_cover_path,
      COALESCE(array_agg(DISTINCT c.name) FILTER(WHERE c.id IS NOT NULL),ARRAY[]::text[]) AS category_names
    FROM blogs b LEFT JOIN blog_categories bc ON bc.blog_id=b.id LEFT JOIN categories c ON c.id=bc.category_id
    WHERE b.slug=$1 AND b.status='published'`, [req.params.slug]);
  if (!result.length) throw fail(404, 'Blog no encontrado.');
  res.json({ blog: { ...result[0], ...coverData(req, result[0]) } });
}));

app.get('/api/blogs/:slug/page', authenticate, asyncRoute(async (req, res) => {
  if (!validSlug(req.params.slug)) throw fail(400, 'Slug no válido.');
  const result = await pool.query(
    `SELECT b.id,b.slug,b.title,b.author_name,b.status,f.content
     FROM blogs b JOIN blog_files f ON f.blog_id=b.id AND f.path='index.html'
     WHERE b.slug=$1 AND b.status='published'`, [req.params.slug]
  );
  if (!result.rows.length) throw fail(404, 'No se encontró la página del blog.');
  const blog = result.rows[0];
  const apiBase = `${req.protocol}://${req.get('host')}`;
  const fileBase = `${apiBase}/api/blog-files/${encodeURIComponent(blog.slug)}/`;
  const appHome = SITE_BASE_URL.endsWith('/') ? SITE_BASE_URL : `${SITE_BASE_URL}/`;
  let html = blog.content.toString('utf8');
  const styleRows = await pool.query(
    "SELECT path,content FROM blog_files WHERE blog_id=$1 AND LOWER(path) LIKE '%.css'",
    [blog.id]
  );
  const styles = new Map(styleRows.rows.map(row => [row.path, row.content.toString('utf8')]));
  html = html.replace(/\{\{BLOG_AUTHOR\}\}/g, escapeHtml(blog.author_name || 'Autor del blog'));
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = html.replace(/href=(['"])(?:\.\.\/)+(?:\1)/gi, `href="${escapeHtml(appHome)}" target="_top" data-myblogs-home`);
  // srcdoc is sandboxed with an opaque origin. Inline each packaged stylesheet
  // so the browser can apply the original design without granting same-origin
  // access to the embedded blog.
  html = html.replace(/<link\b[^>]*rel=(['"])stylesheet\1[^>]*>/gi, tag => {
    const href = tag.match(/\bhref=(['"])(.*?)\1/i)?.[2];
    if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return tag;
    const stylePath = path.posix.normalize(path.posix.join(path.posix.dirname('index.html'), href));
    const source = styles.get(stylePath);
    if (!source) return tag;
    const css = source.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, value) => {
      const asset = String(value).trim();
      if (!asset || /^(?:data:|https?:|\/\/|#)/i.test(asset)) return match;
      const [assetPath, suffix = ''] = asset.split(/(?=[?#])/, 2);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(stylePath), assetPath));
      if (resolved === '..' || resolved.startsWith('../')) return match;
      const assetUrl = `${fileBase}${resolved.split('/').map(encodeURIComponent).join('/')}${suffix}`;
      return `url("${assetUrl}")`;
    }).replace(/<\/style/gi, '<\\/style');
    return `<style>${css}</style>`;
  });
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, frame => {
    const match = frame.match(/\bsrc=(['"])(https?:\/\/(?:www\.)?youtube-nocookie\.com\/embed\/([\w-]+)[^'"]*)\1/i);
    if (!match) return frame;
    const videoId = match[3];
    const title = frame.match(/\btitle=(['"])(.*?)\1/i)?.[2] || 'Ver video en YouTube';
    return `<a class="myblogs-video-link" href="https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(title)}"><img src="https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg" alt="Miniatura: ${escapeHtml(title)}"><span>▶ Ver en YouTube</span></a>`;
  });

  const chromeStyle = `<style>
    .platform-bar,.site-head{position:sticky!important;top:0!important;z-index:20!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:1rem!important;min-height:66px!important;height:auto!important;padding:14px clamp(16px,4vw,48px)!important;background:#fff!important;border-bottom:1px solid #dedede!important;color:#222!important;font:700 14px Arial,Helvetica,sans-serif!important}
    .platform-bar a,.site-head a{font-family:Arial,Helvetica,sans-serif!important;text-decoration:none!important}.platform-bar .platform-brand:before,.site-head .brand:before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:#b92736;margin-right:9px}.platform-bar .platform-brand,.site-head .brand{color:#222!important}.platform-bar .back,.site-head .back{color:#b92736!important;font-weight:700!important}
    .platform-footer{position:relative!important;z-index:1!important;width:100%!important;min-height:66px!important;margin:34px 0 0!important;padding:22px clamp(16px,4vw,48px)!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:1rem!important;background:#fff!important;border-top:1px solid #dedede!important;color:#626262!important;font:14px Arial,Helvetica,sans-serif!important}
    .platform-footer a{color:#b92736!important;text-decoration:none!important;font-weight:700!important}
    .blog-banner .blog-title,.blog-banner .blog-tools{position:relative!important;z-index:3!important}
    .video-frame{position:relative!important;overflow:hidden!important}
    .myblogs-video-link{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;background:#13202a;color:#fff!important;text-decoration:none!important}.myblogs-video-link img{display:block;width:100%;height:100%;object-fit:cover;opacity:.86}.myblogs-video-link span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 15px;border-radius:999px;background:#c90024;color:#fff;font:700 13px Arial,sans-serif;white-space:nowrap}
    @media(max-width:600px){.platform-bar,.site-head{min-height:54px!important;padding:12px 14px!important}.platform-footer{min-height:54px!important;margin-top:24px!important;padding:16px 14px!important;font-size:12px!important}}
  </style>`;
  html = html.replace(/<\/head>/i, `${chromeStyle}<base href="${escapeHtml(fileBase)}"></head>`);

  html = html.replace(/<a\b[^>]*class=(['"])[^'"]*\bblog-back\b[^'"]*\1[^>]*>/gi, tag => {
    const withoutHomeMarker = tag.replace(/\sdata-myblogs-home(?:=(['"])[^'"]*\1)?/i, '');
    const withHome = withoutHomeMarker.replace(/\shref=(['"])[^'"]*\1/i, ` href="${escapeHtml(appHome)}"`);
    return withHome.replace(/\s+target=(['"])[^'"]*\1/i, '').replace(/>$/, ' target="_top" data-myblogs-home>');
  });

  const attribution = findHtmlElementByClass(html, ['blogger-attribution']);
  if (attribution) html = replaceHtmlElement(html, attribution, '');
  let sourceFooter = findHtmlElementByClass(html, ['platform-footer']) || findHtmlElementByTag(html, 'footer');
  const footerLabel = sourceFooter?.html.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1]
    || `${escapeHtml(blog.title)} · ${escapeHtml(blog.author_name || 'Autor del blog')}`;
  const unifiedFooter = `<footer class="platform-footer"><span>${footerLabel}</span><a href="${escapeHtml(appHome)}" target="_top" data-myblogs-home>Volver a My Blogs ↑</a></footer>`;
  html = sourceFooter ? replaceHtmlElement(html, sourceFooter, unifiedFooter) : html.replace(/<\/body>/i, unifiedFooter + '</body>');
  if (attribution) {
    const footer = findHtmlElementByClass(html, ['platform-footer']);
    if (footer) html = `${html.slice(0, footer.start)}${attribution.html}${html.slice(footer.start)}`;
  }

  // The iframe keeps its own scroll area so sticky Blogger chrome works like
  // the original InfinityFree page; no height feedback loop is needed.
  html = html.replace(/<\/body>/i, `<script src="${escapeHtml(apiBase)}/assets/js/blog-frame-resize.js" defer></script></body>`);
  res.json({ html });
}));

app.get(/^\/api\/blog-files\/([^/]+)\/(.+)$/, asyncRoute(async (req, res) => {
  const slug = req.params[0];
  const filePath = req.params[1].replaceAll('\\', '/');
  if (!validSlug(slug) || filePath.includes('\0') || filePath.startsWith('/') || filePath.split('/').some(part => part === '..' || part === '.')) {
    throw fail(400, 'Ruta de archivo no válida.');
  }
  const result = await pool.query(
    `SELECT f.content_type,f.content,f.byte_length
     FROM blog_files f JOIN blogs b ON b.id=f.blog_id
     WHERE b.slug=$1 AND b.status='published' AND f.path=$2`, [slug, filePath]
  );
  if (!result.rows.length) throw fail(404, 'Archivo no encontrado.');
  const file = result.rows[0];
  res.set({
    'Content-Type': file.content_type,
    'Content-Length': String(file.byte_length),
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  }).send(file.content);
}));

app.get('/api/admin/blogs', authenticate, requireRole('editor', 'super_admin'), asyncRoute(async (_req, res) => {
  const blogs = await blogRows(`
    SELECT b.id,b.title,b.slug,b.description,b.author_name,b.source_platform,b.original_url,b.integration_mode,
      b.cover_image,b.status,b.is_featured,b.published_at,
      COALESCE(array_agg(DISTINCT c.name) FILTER(WHERE c.id IS NOT NULL),ARRAY[]::text[]) AS category_names,
      COALESCE(array_agg(DISTINCT bc.category_id) FILTER(WHERE bc.category_id IS NOT NULL),ARRAY[]::bigint[]) AS category_ids
    FROM blogs b LEFT JOIN blog_categories bc ON bc.blog_id=b.id LEFT JOIN categories c ON c.id=bc.category_id
    WHERE TRUE`);
  res.json({ blogs });
}));

app.post('/api/admin/blogs', authenticate, requireRole('editor', 'super_admin'), upload.single('blog_zip'), asyncRoute(async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const slug = String(body.slug || '').trim();
  const mode = String(body.integration_mode || 'external');
  const status = String(body.status || 'draft');
  const originalUrl = String(body.original_url || '').trim();
  const coverImage = String(body.cover_image || '').trim();
  if (!title || !validSlug(slug)) throw fail(400, 'Escribe un título y un slug válido.');
  if (!['external', 'embed', 'local'].includes(mode) || !['draft', 'published', 'archived'].includes(status)) throw fail(400, 'Selecciona un modo y estado válidos.');
  if (!validOptionalHttpUrl(coverImage)) throw fail(400, 'La portada debe usar una URL HTTP o HTTPS.');
  if (mode === 'local' && !req.file) throw fail(400, 'Adjunta el ZIP del blog local.');
  if (mode !== 'local' && !/^https?:\/\//i.test(originalUrl)) throw fail(400, 'Escribe una URL original válida.');
  const files = req.file ? readZip(req.file.buffer) : [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO blogs(admin_id,title,slug,description,author_name,source_platform,original_url,integration_mode,cover_image,status,is_featured,published_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $10='published' THEN NOW() ELSE NULL END) RETURNING id`,
      [req.user.id,title,slug,String(body.description||''),String(body.author_name||''),String(body.source_platform||'other'),originalUrl,mode,coverImage,status,body.is_featured==='true'||body.is_featured==='1']
    );
    const id = inserted.rows[0].id;
    if (files.length) await saveBlogFiles(client, id, files);
    await syncBlogCategories(client,id,parseCategoryIds(body.category_ids));
    await client.query('COMMIT');
    res.status(201).json({ id, message: 'Blog guardado.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') throw fail(409, 'Ese slug ya está registrado.');
    throw error;
  } finally { client.release(); }
}));

app.put('/api/admin/blogs/:id', authenticate, requireRole('editor','super_admin'), upload.single('blog_zip'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const slug = String(body.slug || '').trim();
  const mode = String(body.integration_mode || 'external');
  const status = String(body.status || 'draft');
  const originalUrl = String(body.original_url || '').trim();
  const coverImage = String(body.cover_image || '').trim();
  if (!Number.isSafeInteger(id) || id < 1 || !title || !validSlug(slug)) throw fail(400, 'Datos del blog no válidos.');
  if (!['external','embed','local'].includes(mode) || !['draft','published','archived'].includes(status)) throw fail(400, 'Modo o estado no válido.');
  if (!validOptionalHttpUrl(coverImage)) throw fail(400, 'La portada debe usar una URL HTTP o HTTPS.');
  if (mode !== 'local' && !/^https?:\/\//i.test(originalUrl)) throw fail(400, 'Escribe una URL original válida.');
  if (mode === 'local' && req.file === undefined) {
    const found = await pool.query('SELECT 1 FROM blog_files WHERE blog_id=$1 LIMIT 1',[id]);
    if (!found.rows.length) throw fail(400, 'Adjunta el ZIP del blog local.');
  }
  const files = req.file ? readZip(req.file.buffer) : null;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const saved=await client.query(
      `UPDATE blogs SET title=$1,slug=$2,description=$3,author_name=$4,source_platform=$5,original_url=$6,
       integration_mode=$7,cover_image=$8,status=$9,is_featured=$10,
       published_at=CASE WHEN $9::varchar='published' THEN COALESCE(published_at,NOW()) ELSE NULL END
       WHERE id=$11 RETURNING id`,
      [title,slug,String(body.description||''),String(body.author_name||''),String(body.source_platform||'other'),originalUrl,mode,coverImage,status,body.is_featured==='true'||body.is_featured==='1',id]
    );
    if(!saved.rows.length) throw fail(404,'Blog no encontrado.');
    if(files){await client.query('DELETE FROM blog_files WHERE blog_id=$1',[id]);await saveBlogFiles(client,id,files)}
    await syncBlogCategories(client,id,parseCategoryIds(body.category_ids));
    await client.query('COMMIT'); res.json({message:'Cambios guardados.'});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error.code==='23505')throw fail(409,'Ese slug ya está registrado.');throw error}
  finally{client.release()}
}));

app.delete('/api/admin/blogs/:id', authenticate, requireRole('editor','super_admin'), asyncRoute(async (req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Blog no válido.');
  const result=await pool.query('DELETE FROM blogs WHERE id=$1 RETURNING id',[id]);
  if(!result.rows.length)throw fail(404,'Blog no encontrado.');
  res.json({message:'Blog eliminado.'});
}));

app.post('/api/admin/categories',authenticate,requireRole('editor','super_admin'),asyncRoute(async(req,res)=>{
  const name=String(req.body?.name||'').trim();
  const slug=String(req.body?.slug||'').trim().toLowerCase();
  if(!name||!validSlug(slug))throw fail(400,'Escribe un nombre y slug válidos.');
  try{const result=await pool.query('INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING id,name,slug',[name,slug]);res.status(201).json({category:result.rows[0]})}
  catch(error){if(error.code==='23505')throw fail(409,'Esa categoría ya existe.');throw error}
}));

app.delete('/api/admin/categories/:id',authenticate,requireRole('editor','super_admin'),asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Categoría no válida.');
  const result=await pool.query('DELETE FROM categories WHERE id=$1 RETURNING id',[id]);if(!result.rows.length)throw fail(404,'Categoría no encontrada.');res.json({message:'Categoría eliminada.'});
}));

app.get('/api/admin/users',authenticate,requireRole('super_admin'),asyncRoute(async(_req,res)=>{
  const result=await pool.query('SELECT id,name,email,role,is_active,created_at FROM admins ORDER BY name');res.json({users:result.rows});
}));

app.post('/api/admin/users',authenticate,requireRole('super_admin'),asyncRoute(async(req,res)=>{
  const {name,email,password,role}=req.body||{};
  if(!String(name||'').trim()||!/^\S+@\S+\.\S+$/.test(String(email||''))||String(password||'').length<12||!['editor','super_admin','viewer'].includes(role))throw fail(400,'Revisa nombre, correo, rol y contraseña (mínimo 12 caracteres).');
  const hash=await bcrypt.hash(String(password),12);
  try{const result=await pool.query('INSERT INTO admins(name,email,password_hash,role) VALUES($1,LOWER($2),$3,$4) RETURNING id,name,email,role,is_active',[String(name).trim(),String(email).trim(),hash,role]);res.status(201).json({user:result.rows[0]})}
  catch(error){if(error.code==='23505')throw fail(409,'Ese correo ya tiene una cuenta.');throw error}
}));

app.put('/api/admin/users/:id',authenticate,requireRole('super_admin'),asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);const {name,email,role,is_active,password}=req.body||{};
  if(!Number.isSafeInteger(id)||id<1||!String(name||'').trim()||!/^\S+@\S+\.\S+$/.test(String(email||''))||!['editor','super_admin','viewer'].includes(role))throw fail(400,'Datos del usuario no válidos.');
  if(id===Number(req.user.id)&&role!=='super_admin')throw fail(400,'No puedes quitarte el rol de superadministrador desde tu propia sesión.');
  const active=is_active===true||is_active==='true';
  const remaining=await pool.query("SELECT COUNT(*)::int AS count FROM admins WHERE role='super_admin' AND is_active=TRUE AND id<>$1",[id]);
  if(!active&&id===Number(req.user.id))throw fail(400,'No puedes desactivar tu propia cuenta.');
  const target=await pool.query('SELECT role,is_active FROM admins WHERE id=$1',[id]);if(!target.rows.length)throw fail(404,'Usuario no encontrado.');
  if(target.rows[0].role==='super_admin'&&target.rows[0].is_active&&(role!=='super_admin'||!active)&&remaining.rows[0].count===0)throw fail(400,'Debe quedar al menos un superadministrador activo.');
  const hash=String(password||'').length?await bcrypt.hash(String(password),12):null;
  if(hash&&String(password).length<12)throw fail(400,'La contraseña debe tener al menos 12 caracteres.');
  const result=await pool.query(`UPDATE admins SET name=$1,email=LOWER($2),role=$3,is_active=$4,password_hash=COALESCE($5,password_hash),updated_at=NOW() WHERE id=$6 RETURNING id,name,email,role,is_active`,[String(name).trim(),String(email).trim(),role,active,hash,id]);res.json({user:result.rows[0]});
}));

app.delete('/api/admin/users/:id',authenticate,requireRole('super_admin'),asyncRoute(async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Usuario no válido.');if(id===Number(req.user.id))throw fail(400,'No puedes eliminar tu propia cuenta.');
  const target=await pool.query('SELECT role,is_active FROM admins WHERE id=$1',[id]);if(!target.rows.length)throw fail(404,'Usuario no encontrado.');
  if(target.rows[0].role==='super_admin'&&target.rows[0].is_active){const count=await pool.query("SELECT COUNT(*)::int AS count FROM admins WHERE role='super_admin' AND is_active=TRUE");if(count.rows[0].count<2)throw fail(400,'Debe quedar al menos un superadministrador activo.')}
  await pool.query('DELETE FROM admins WHERE id=$1',[id]);res.json({message:'Usuario eliminado.'});
}));

// Render serves the main app and API from the same public URL.
app.use(express.static(frontendRoot, { index: 'index.html' }));

app.use((_req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
app.use((error,_req,res,_next)=>{
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'El ZIP no puede superar 20 MB.' : 'No se pudo recibir el ZIP.';
    return res.status(400).json({ error: message });
  }
  const status = Number(error.status) || 500;
  if(status>=500)console.error(error);
  res.status(status).json({error:status>=500?'Ocurrió un error interno.':error.message});
});

async function start() {
  await initializeDatabase();
  await seedPackagedBlogs();
  app.listen(PORT, '0.0.0.0', () => console.log(`My Blogs API escuchando en ${PORT}.`));
}

start().catch(error=>{console.error('No se pudo iniciar My Blogs API:',error);process.exit(1)});
