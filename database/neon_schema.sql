-- Esquema PostgreSQL para My Blogs en Neon.
-- Ejecutar una vez en Neon -> SQL Editor antes del primer despliegue de Render.

BEGIN;

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'editor'
    CHECK (role IN ('super_admin', 'editor', 'viewer')),
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
  integration_mode VARCHAR(20) NOT NULL DEFAULT 'external'
    CHECK (integration_mode IN ('external', 'embed', 'local')),
  cover_image TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compatibilidad con bases creadas usando una versión anterior del esquema.
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

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
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blog_id, slug)
);

INSERT INTO categories (name, slug, description) VALUES
  ('Tecnología', 'tecnologia', 'Programación, herramientas y tecnología.'),
  ('Estilo de vida', 'estilo-de-vida', 'Hábitos, bienestar y experiencias.'),
  ('Educación', 'educacion', 'Aprendizaje, estudio y productividad.'),
  ('Viajes', 'viajes', 'Destinos, guías y aventuras.'),
  ('Música', 'musica', 'Canciones, artistas y listas favoritas.'),
  ('Salud y bienestar', 'salud-bienestar', 'Salud emocional, bienestar y cuidado.'),
  ('Medio ambiente', 'medio-ambiente', 'Naturaleza, conservación y cambio climático.'),
  ('Historia y cultura', 'historia-cultura', 'Historia, identidad y expresiones culturales.'),
  ('Cultura', 'cultura', 'Cultura digital, medios y expresiones sociales.'),
  ('Negocios', 'negocios', 'Emprendimiento, comercio y actividad económica.'),
  ('Otros', 'otros', 'Ideas y temas variados.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
