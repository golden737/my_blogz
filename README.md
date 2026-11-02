# My Blogs — GitHub Pages + Render + Neon

Esta versión sustituye el portal PHP/MySQL por una interfaz HTML/CSS/JavaScript en GitHub Pages, una API Node.js/Express en Render y PostgreSQL en Neon.

## Incluye

- Los diez blogs finales que ya preparamos, con sus imágenes, hojas de estilo y páginas.
- Catálogo con búsqueda y categorías.
- Login y roles `super_admin`, `editor` y `viewer`.
- Panel para crear, editar y eliminar blogs, categorías y usuarios.
- El nombre del campo **Autor** se coloca en el pie de cada blog al mostrarlo.
- La subida de un ZIP guarda sus archivos dentro de Neon. No depende del disco temporal de Render.
- API con JWT, validación de ZIP, límites de tamaño, CORS y protección de contraseñas.

## Preparar el repositorio de GitHub

1. Crea un repositorio nuevo en GitHub y sube el contenido de esta carpeta. Para GitHub Pages en el plan Free, el repositorio debe ser público. El sitio publicado es accesible públicamente; los archivos fuente de los diez blogs también estarán visibles dentro del repositorio público.
2. En **Settings → Pages**, elige **GitHub Actions** como fuente.
3. El flujo `.github/workflows/pages.yml` publica la carpeta `frontend` cuando se sube un cambio a `main`.
4. Anota la dirección del sitio. En un repositorio de proyecto suele tener esta forma: `https://USUARIO.github.io/REPOSITORIO/`.

La URL del API se configura después de crear el servicio de Render.

## Crear la base de Neon

1. Crea un proyecto PostgreSQL en Neon.
2. En **Connect**, copia la URL de conexión **pooled** de la rama/base que usarás. Debe incluir SSL (`sslmode=require`). Neon recomienda la conexión pooled cuando la aplicación abre varias conexiones.
3. No pongas esa URL en `frontend/config.js` ni en GitHub; se guarda como secreto en Render.
4. Abre el **SQL Editor** de Neon, pega y ejecuta `database/neon_schema.sql`. Esto crea las tablas y categorías de My Blogs.

Al arrancar, Render agrega las diez fichas y sus archivos a Neon y crea el primer superadministrador usando las variables de entorno. No tienes que importar los blogs ni sus imágenes a mano.

## Crear el API en Render

1. En Render elige **New → Blueprint** y conecta el mismo repositorio.
2. Render detectará `render.yaml` y solicitará los valores privados. Configura:
   - `DATABASE_URL`: URL pooled de Neon.
   - `FRONTEND_ORIGIN`: solo el origen de Pages, por ejemplo `https://USUARIO.github.io` (sin el nombre del repositorio).
   - `SITE_BASE_URL`: URL completa de Pages, por ejemplo `https://USUARIO.github.io/REPOSITORIO/` (con `/` final).
   - `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL` y `INITIAL_ADMIN_PASSWORD`: datos para crear tu cuenta inicial. Usa una contraseña de al menos 12 caracteres.
   - `JWT_SECRET` se genera automáticamente desde el Blueprint; no la publiques ni la copies al frontend.
3. Cuando Render termine, copia la URL pública del servicio, como `https://myblogs-api.onrender.com`.
4. Edita `frontend/config.js` y reemplaza `https://YOUR-MYBLOGS-API.onrender.com` por esa URL. Sube el cambio a `main`; GitHub Actions volverá a publicar la interfaz.

## Uso

- Entra al sitio de GitHub Pages con el correo y contraseña iniciales que configuraste en Render.
- El API requiere iniciar sesión para mostrar el catálogo y el panel.
- Para añadir un blog local, el ZIP debe incluir `index.html` en la raíz. Límite: 20 MB comprimido y 50 MB descomprimido.
- En **Autor**, escribe el nombre que quieres que aparezca en el pie.
- Los archivos se guardan en PostgreSQL/Neon, así que reiniciar o volver a desplegar Render no los borra.

## Desarrollo local

1. Copia `api/.env.example` a `api/.env` y completa sus valores.
2. Desde `api`, ejecuta `npm install` y `npm start`.
3. Cambia `frontend/config.js` a `http://localhost:10000` y sirve `frontend` con un servidor estático local. En `FRONTEND_ORIGIN` añade el origen exacto de ese servidor.

## Límites del plan gratuito

GitHub Pages sirve la interfaz estática. En el plan Free, Render suspende un Web Service sin tráfico después de 15 minutos y el primer acceso posterior puede tardar alrededor de un minuto en despertar. Para que el API esté disponible sin esa espera, se necesita un servicio Render de pago. Neon mantiene los datos; el API no usa almacenamiento local persistente.

## Seguridad

- No guardes `DATABASE_URL`, `JWT_SECRET` ni la contraseña inicial en el repositorio.
- La URL de API en `frontend/config.js` no es secreta; el navegador necesita conocerla.
- Las páginas publicadas de GitHub Pages son públicas. No subas aquí blogs, borradores o datos personales que deban permanecer privados.
- Usa la cuenta superadministradora inicial para crear otras cuentas desde el panel.
