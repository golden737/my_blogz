import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL.');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'editor' CHECK (role IN ('super_admin','editor','viewer')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS blogs (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      slug VARCHAR(220) NOT NULL UNIQUE,
      description TEXT,
      author_name VARCHAR(150),
      source_platform VARCHAR(30) NOT NULL DEFAULT 'other',
      original_url TEXT NOT NULL DEFAULT '',
      integration_mode VARCHAR(20) NOT NULL DEFAULT 'external' CHECK (integration_mode IN ('external','embed','local')),
      cover_image TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);
    CREATE INDEX IF NOT EXISTS idx_blogs_featured ON blogs(is_featured);
    CREATE TABLE IF NOT EXISTS blog_categories (
      blog_id BIGINT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
      category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (blog_id, category_id)
    );
    CREATE TABLE IF NOT EXISTS blog_files (
      blog_id BIGINT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content_type VARCHAR(150) NOT NULL,
      content BYTEA NOT NULL,
      byte_length BIGINT NOT NULL,
      PRIMARY KEY (blog_id, path)
    );
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      blog_id BIGINT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
      title VARCHAR(250) NOT NULL,
      slug VARCHAR(270) NOT NULL,
      excerpt TEXT,
      content TEXT,
      original_post_url TEXT,
      cover_image TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(blog_id, slug)
    );
  `);

  const categories = [
    ['Tecnología', 'tecnologia', 'Programación, herramientas y tecnología.'],
    ['Estilo de vida', 'estilo-de-vida', 'Hábitos, bienestar y experiencias.'],
    ['Educación', 'educacion', 'Aprendizaje, estudio y productividad.'],
    ['Viajes', 'viajes', 'Destinos, guías y aventuras.'],
    ['Música', 'musica', 'Canciones, artistas y listas favoritas.'],
    ['Otros', 'otros', 'Ideas y temas variados.']
  ];
  for (const [name, slug, description] of categories) {
    await pool.query(
      'INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING',
      [name, slug, description]
    );
  }

  const count = await pool.query('SELECT COUNT(*)::int AS count FROM admins');
  if (count.rows[0].count === 0) {
    const { INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD } = process.env;
    if (!INITIAL_ADMIN_NAME || !INITIAL_ADMIN_EMAIL || !INITIAL_ADMIN_PASSWORD || INITIAL_ADMIN_PASSWORD.length < 12) {
      throw new Error('La base está vacía. Configura INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL y una INITIAL_ADMIN_PASSWORD de al menos 12 caracteres en Render.');
    }
    const hash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 12);
    await pool.query(
      `INSERT INTO admins(name,email,password_hash,role) VALUES($1,LOWER($2),$3,'super_admin') ON CONFLICT(email) DO NOTHING`,
      [INITIAL_ADMIN_NAME.trim(), INITIAL_ADMIN_EMAIL.trim(), hash]
    );
  }
}
