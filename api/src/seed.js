import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedRoot = path.resolve(here, '..', 'seed', 'blogs');

const blogs = [
  { title: 'Algoritmos bajo sospecha', slug: 'algoritmos-bajo-sospecha', description: 'El sesgo de la inteligencia artificial en el empleo.', author_name: 'Cesia Campos', original_url: '', categories: ['tecnologia'], folder: 'algoritmos-bajo-sospecha', cover: 'assets/pages/pagina-01.jpg', published_at: '2026-06-13' },
  { title: 'El impacto cultural de BTS', slug: 'el-impacto-cultural-de-bts', description: 'La campaña Love Myself, la salud mental y el impacto cultural de BTS.', author_name: 'Keyri Gámez', original_url: '', categories: ['musica'], folder: 'el-impacto-cultural-de-bts', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'Pensamiento crítico', slug: 'pensamiento-critico', description: 'El pensamiento crítico en la sociedad contemporánea.', author_name: 'Paola Abrego', original_url: 'https://tecnologiapensamientocritico2026.blogspot.com/', categories: ['educacion'], folder: 'pensamiento-critico', cover: 'cover.jpg', published_at: '2026-06-15' },
  { title: 'Las vaquitas marinas necesitan tu ayuda', slug: 'vaquitas-marinas', description: 'La conservación de la vaquita marina y las amenazas que enfrenta.', author_name: 'Deysi Ramos', original_url: 'https://lasvaquitasmarinasnecesitantuayuda.blogspot.com/', categories: ['otros'], folder: 'vaquitas-marinas', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'Raíces sin tierra', slug: 'raices-sin-tierra', description: 'La cultura salvadoreña y las raíces silenciadas durante el Martinato.', author_name: '', original_url: 'https://raicessintierra.blogspot.com/', categories: ['educacion'], folder: 'raices-sin-tierra', cover: 'cover.svg', published_at: '2026-06-14' },
  { title: 'El rugido del clima', slug: 'el-rugido-del-clima', description: 'Cómo el calentamiento global intensifica los fenómenos meteorológicos extremos.', author_name: 'Mayra Gómez', original_url: 'https://mayragomez1218.blogspot.com/', categories: ['otros'], folder: 'el-rugido-del-clima', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'I(nteligencia) A(utónoma) en 5 Minutos', slug: 'ia-en-5-minutos', description: 'Inteligencia artificial en el sistema educativo salvadoreño.', author_name: 'Eduardo Romero', original_url: 'https://iaen5minutos.blogspot.com/', categories: ['tecnologia'], folder: 'ia-en-5-minutos', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'Educación de computación cuántica', slug: 'educacion-computacion-cuantica', description: 'La educación en computación cuántica y su integración gradual en las universidades.', author_name: 'Fredy Gutiérrez', original_url: 'https://fredygutierrezc2.blogspot.com/', categories: ['tecnologia', 'educacion'], folder: 'educacion-computacion-cuantica', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'The Academic Blog', slug: 'the-academic-blog', description: 'Protección de la privacidad de los usuarios ante el avance de la inteligencia artificial.', author_name: '', original_url: 'https://exelyntheacademy.blogspot.com/', categories: ['tecnologia'], folder: 'the-academic-blog', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'El impacto de la IA aplicada a la logística y aduanas', slug: 'ia-aplicada-logistica-aduanas', description: 'La inteligencia artificial aplicada a la logística y las aduanas.', author_name: '', original_url: 'https://elvismerazlogistica.blogspot.com/', categories: ['tecnologia'], folder: 'ia-aplicada-logistica-aduanas', cover: 'cover.jpg', published_at: '2026-06-13' }
];

const obsoleteCoverUrls = {
  'raices-sin-tierra': 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgioIf9OEx6ku9hLSCUXNh7MU6z6jBTa_iAwmqnNPxvxXG2LBw9wsa8U6mr3fQfMYsUD7yIdvbcVmjIawc427bD1JWRCrMN6HBuoR7xt_QmXD_Xf3NqpX_V6FEI5mBo17tye0_qUujV7YYzj2W9rHtw9t5ScuQXEanwnrZtD5k87kHSqWquCqVH-d-ajW8/s800/El-Salvador.jpg',
  'vaquitas-marinas': 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhOCxRcJaXLc0-T6jiKgZwlACM5jlz8ffjkzP41nZQKNz9t0OUM4t1ocp3RTb8cfGOc_UtL4JdfIPeVidlaS1Z4OvUEWN4BgqxpQRM5dksickEPnuRZZ3gg25ooGu7Zh3kVUKNvQXsPNhc7MTquAMmdkZXWrQNRMuiyk5e-8C83eA0LkjKF0H-r6o_QX9M/s960/Vaquita6_Olson_NOAA.jpg',
  'el-rugido-del-clima': 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhD73bCTR0AU-ghbD-cNuRu_5MC58rm0V2s7F8ySONpDH5W08sikgOheJHTc4Da1l74NW-7DKfX-OHUl-9RRLtrcbKURKqSz3TEe-3r3qUTamkD48iw64cvrDHvuqQ-gbnumkpaBv6zhPaH4h-7AMkNE2KoduoI7z2xCw3waKolH-tuVgxbZPKp8qx3otRH/s1408/Gemini_Generated_Image_ze3k1wze3k1wze3k.png'
};

async function walkFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walkFiles(path.join(dir, entry.name), relative));
    else files.push({ relative, fullPath: path.join(dir, entry.name) });
  }
  return files;
}

export async function seedPackagedBlogs() {
  const client = await pool.connect();
  try {
    for (const item of blogs) {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO blogs(title,slug,description,author_name,source_platform,original_url,integration_mode,cover_image,status,published_at)
         VALUES($1,$2,$3,$4,'custom',$5,'local',$6,'published',$7::date)
         ON CONFLICT(slug) DO NOTHING RETURNING id`,
        [item.title, item.slug, item.description, item.author_name, item.original_url, item.cover_image || '', item.published_at]
      );
      const found = inserted.rows[0]
        ? inserted.rows[0]
        : (await client.query('SELECT id FROM blogs WHERE slug=$1', [item.slug])).rows[0];
      const obsoleteCoverUrl = obsoleteCoverUrls[item.slug];
      if (obsoleteCoverUrl) {
        await client.query(
          'UPDATE blogs SET cover_image=NULL WHERE id=$1 AND cover_image=$2',
          [found.id, obsoleteCoverUrl]
        );
      }
      if (item.cover_image) {
        await client.query(
          `UPDATE blogs SET cover_image=$1 WHERE id=$2 AND COALESCE(cover_image,'')=''`,
          [item.cover_image, found.id]
        );
      }
      for (const categorySlug of item.categories) {
        await client.query(
          `INSERT INTO blog_categories(blog_id,category_id)
           SELECT $1,id FROM categories WHERE slug=$2 ON CONFLICT DO NOTHING`,
          [found.id, categorySlug]
        );
      }
      const folder = path.join(seedRoot, item.folder);
      const files = await walkFiles(folder);
      for (const file of files) {
        const content = await readFile(file.fullPath);
        const contentType = contentTypeFor(file.relative);
        await client.query(
          `INSERT INTO blog_files(blog_id,path,content_type,content,byte_length)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(blog_id,path) DO UPDATE SET
            content_type=EXCLUDED.content_type,content=EXCLUDED.content,byte_length=EXCLUDED.byte_length`,
          [found.id, file.relative, contentType, content, content.length]
        );
      }
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf',
    '.avif': 'image/avif'
  })[ext] || 'application/octet-stream';
}
