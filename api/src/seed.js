import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedRoot = path.resolve(here, '..', 'seed', 'blogs');

const blogs = [
  { title: 'Algoritmos bajo sospecha', slug: 'algoritmos-bajo-sospecha', description: 'El sesgo de la inteligencia artificial en el empleo.', author_name: 'Cesia Campos', original_url: '', categories: ['tecnologia', 'negocios'], folder: 'algoritmos-bajo-sospecha', cover: 'assets/pages/pagina-01.jpg', published_at: '2026-06-13' },
  { title: 'El impacto cultural de BTS', slug: 'el-impacto-cultural-de-bts', description: 'La campaña Love Myself, la salud mental y el impacto cultural de BTS.', author_name: 'Keyri Gámez', original_url: '', categories: ['musica', 'cultura'], folder: 'el-impacto-cultural-de-bts', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'Pensamiento crítico', slug: 'pensamiento-critico', description: 'El pensamiento crítico en la sociedad contemporánea.', author_name: 'Paola Abrego', original_url: 'https://tecnologiapensamientocritico2026.blogspot.com/', categories: ['educacion'], folder: 'pensamiento-critico', cover: 'cover.jpg', published_at: '2026-06-15' },
  { title: 'Las vaquitas marinas necesitan tu ayuda', slug: 'vaquitas-marinas', description: 'La conservación de la vaquita marina y las amenazas que enfrenta.', author_name: 'Deysi Ramos', original_url: 'https://lasvaquitasmarinasnecesitantuayuda.blogspot.com/', categories: ['medio-ambiente'], folder: 'vaquitas-marinas', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'Raíces sin tierra', slug: 'raices-sin-tierra', description: 'La cultura salvadoreña y las raíces silenciadas durante el Martinato.', author_name: '', original_url: 'https://raicessintierra.blogspot.com/', categories: ['historia-cultura'], folder: 'raices-sin-tierra', cover: 'cover.svg', published_at: '2026-06-14' },
  { title: 'El rugido del clima', slug: 'el-rugido-del-clima', description: 'Cómo el calentamiento global intensifica los fenómenos meteorológicos extremos.', author_name: 'Mayra Gómez', original_url: 'https://mayragomez1218.blogspot.com/', categories: ['medio-ambiente'], folder: 'el-rugido-del-clima', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'I(nteligencia) A(utónoma) en 5 Minutos', slug: 'ia-en-5-minutos', description: 'Inteligencia artificial en el sistema educativo salvadoreño.', author_name: 'Eduardo Romero', original_url: 'https://iaen5minutos.blogspot.com/', categories: ['tecnologia', 'educacion'], folder: 'ia-en-5-minutos', cover: 'cover.svg', published_at: '2026-06-13' },
  { title: 'Educación de computación cuántica', slug: 'educacion-computacion-cuantica', description: 'La educación en computación cuántica y su integración gradual en las universidades.', author_name: 'Fredy Gutiérrez', original_url: 'https://fredygutierrezc2.blogspot.com/', categories: ['tecnologia', 'educacion'], folder: 'educacion-computacion-cuantica', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'The Academic Blog', slug: 'the-academic-blog', description: 'Protección de la privacidad de los usuarios ante el avance de la inteligencia artificial.', author_name: '', original_url: 'https://exelyntheacademy.blogspot.com/', categories: ['tecnologia'], folder: 'the-academic-blog', cover: 'cover.jpg', published_at: '2026-06-13' },
  { title: 'El impacto de la IA aplicada a la logística y aduanas', slug: 'ia-aplicada-logistica-aduanas', description: 'La inteligencia artificial aplicada a la logística y las aduanas.', author_name: '', original_url: 'https://elvismerazlogistica.blogspot.com/', categories: ['tecnologia', 'negocios'], folder: 'ia-aplicada-logistica-aduanas', cover: 'cover.jpg', published_at: '2026-06-13' }
];

const categoryCatalog = [
  ['salud-bienestar', 'Salud y bienestar', 'Salud emocional, bienestar y cuidado.'],
  ['medio-ambiente', 'Medio ambiente', 'Naturaleza, conservación y cambio climático.'],
  ['historia-cultura', 'Historia y cultura', 'Historia, identidad y expresiones culturales.'],
  ['cultura', 'Cultura', 'Cultura digital, medios y expresiones sociales.'],
  ['negocios', 'Negocios', 'Emprendimiento, comercio y actividad económica.']
];

const categoryCorrections = [
  ['%impacto de las redes sociales en los jóvenes%', ['estilo-de-vida', 'educacion']],
  ['%impacto de las redes sociales en el tiempo libre%', ['estilo-de-vida', 'educacion']],
  ['%recuerdos en la industria%', ['cultura', 'negocios']],
  ['%love yourself%', ['musica', 'salud-bienestar']],
  ['%lactancia materna%', ['salud-bienestar']],
  ['%soledad silenciosa juvenil%', ['salud-bienestar', 'estilo-de-vida']],
  ['%el mundo en llamas%', ['medio-ambiente']],
  ['%tradiciones de la cultura maya%', ['historia-cultura']],
  ['%negocio del conflicto%', ['tecnologia', 'cultura']],
  ['%crisis de la atención%', ['educacion', 'salud-bienestar']],
  ['%productividad tóxica%', ['salud-bienestar', 'educacion']],
  ['%memificación de la realidad%', ['cultura', 'tecnologia']],
  ['%pizarrón a la pantalla%', ['educacion', 'tecnologia']],
  ['%redes sociales como factor de riesgo%', ['salud-bienestar', 'tecnologia']],
  ['%edición del genoma%', ['tecnologia', 'salud-bienestar']],
  ['%redes sociales pesan más%', ['salud-bienestar', 'estilo-de-vida']],
  ['%influencia de la música en nuestras emociones%', ['musica', 'salud-bienestar']],
  ['%vitrinas digitales%', ['negocios', 'tecnologia']],
  ['%cemento sobre el acuífero%', ['medio-ambiente', 'tecnologia']],
  ['%embajadores culturales%', ['cultura', 'musica']],
  ['%pérdida de las tradiciones%', ['historia-cultura']],
  ['%genoma%crispr%', ['tecnologia', 'salud-bienestar']],
  ['%estetización de la vida diaria%', ['cultura', 'estilo-de-vida']],
  ['%era cuántica de la medicina%', ['tecnologia', 'salud-bienestar']],
  ['%inteligencia artificial mejora el aprendizaje%', ['educacion', 'tecnologia']]
];

const coverCorrections = [
  ['%lactancia materna%', 'lactancia-materna'],
  ['%soledad silenciosa juvenil%', 'siglo-xxi-soledad-silenciosa-juvenil'],
  ['%impacto de las redes sociales en el tiempo libre%', 'jovenes-desconectados'],
  ['%recuerdos en la industria%', 'recuerdos-en-la-industria'],
  ['%love yourself%', 'love-yourself']
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
    for (const [slug, name, description] of categoryCatalog) {
      await client.query(
        `INSERT INTO categories(name,slug,description) VALUES($1,$2,$3)
         ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description`,
        [name, slug, description]
      );
    }
    const categoryRows = await client.query('SELECT id,slug FROM categories');
    const categoryIds = new Map(categoryRows.rows.map(row => [row.slug, row.id]));
    const replaceCategories = async (blogId, slugs) => {
      await client.query('DELETE FROM blog_categories WHERE blog_id=$1', [blogId]);
      for (const slug of slugs) {
        const categoryId = categoryIds.get(slug);
        if (categoryId) await client.query(
          'INSERT INTO blog_categories(blog_id,category_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [blogId, categoryId]
        );
      }
    };
    await client.query(`CREATE TABLE IF NOT EXISTS app_migrations (
      migration_key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const coverMigration = await client.query(
      `INSERT INTO app_migrations(migration_key) VALUES('2026-11-04-packaged-cover-refresh-v1')
       ON CONFLICT DO NOTHING RETURNING migration_key`
    );
    if (coverMigration.rowCount) {
      await client.query('UPDATE blogs SET cover_image=NULL WHERE slug=ANY($1::text[])', [blogs.map(item => item.slug)]);
    }
    for (const item of blogs) {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO blogs(title,slug,description,author_name,source_platform,original_url,integration_mode,cover_image,status,published_at)
         VALUES($1,$2,$3,$4,'custom',$5,'local',$6,'published',$7::date)
         ON CONFLICT(slug) DO NOTHING RETURNING id`,
        [item.title, item.slug, item.description, item.author_name, item.original_url, '', item.published_at]
      );
      const found = inserted.rows[0]
        ? inserted.rows[0]
        : (await client.query('SELECT id FROM blogs WHERE slug=$1', [item.slug])).rows[0];
      await replaceCategories(found.id, item.categories);
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

    // Reassign categories for previously added panel blogs as well, so the
    // published catalog no longer leaves known topics under the generic tag.
    for (const [titlePattern, slugs] of categoryCorrections) {
      const matchingBlogs = await client.query('SELECT id FROM blogs WHERE title ILIKE $1', [titlePattern]);
      for (const blog of matchingBlogs.rows) await replaceCategories(blog.id, slugs);
    }

    // Refresh local SVG covers for the five existing imported blogs. Matching
    // their titles avoids creating duplicate blog records if a panel slug varies.
    for (const [titlePattern, folder] of coverCorrections) {
      const matches = await client.query('SELECT id FROM blogs WHERE title ILIKE $1', [titlePattern]);
      const cover = await readFile(path.join(seedRoot, folder, 'cover.svg'));
      for (const blog of matches.rows) {
        await client.query('UPDATE blogs SET cover_image=NULL WHERE id=$1', [blog.id]);
        await client.query(
          `INSERT INTO blog_files(blog_id,path,content_type,content,byte_length)
           VALUES($1,'cover.svg','image/svg+xml',$2,$3)
           ON CONFLICT(blog_id,path) DO UPDATE SET content_type=EXCLUDED.content_type,
             content=EXCLUDED.content,byte_length=EXCLUDED.byte_length`,
          [blog.id, cover, cover.length]
        );
      }
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
