const CONFIG = window.MYBLOGS_CONFIG || {};
const API = String(CONFIG.apiBaseUrl || '').replace(/\/$/, '');
const SITE = CONFIG.siteBaseUrl || './';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { token: sessionStorage.getItem('myblogs-token') || '', user: null, blogs: [], categories: [], search: '', category: '', editBlog: null, editUser: null };

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function showFlash(message, type = 'success') {
  const box = $('#flashMessage');
  box.textContent = message;
  box.className = `flash flash-${type}`;
  box.hidden = false;
  window.clearTimeout(showFlash.timer);
  showFlash.timer = window.setTimeout(() => { box.hidden = true; }, 5000);
}
function signOut(message = '') {
  sessionStorage.removeItem('myblogs-token');
  state.token = '';
  state.user = null;
  $('#siteHeader').hidden = true;
  $('#appPage').hidden = true;
  $('#loginPage').hidden = false;
  if (message) showFlashOnLogin(message);
}
function showFlashOnLogin(message) {
  const error = $('#loginError');
  error.textContent = message;
  error.hidden = false;
}
async function api(path, options = {}) {
  if (!API || API.includes('YOUR-MYBLOGS-API')) throw new Error('Configura la URL de tu API de Render en frontend/config.js.');
  const headers = new Headers(options.headers || {});
  if (state.token) headers.set('Authorization', `Bearer ${state.token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response;
  try { response = await fetch(`${API}/api${path}`, { ...options, headers }); }
  catch { throw new Error('No se pudo conectar con la API. Revisa su URL y la configuración CORS de Render.'); }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && state.token) {
    signOut('Tu sesión terminó. Inicia sesión de nuevo.');
    throw new Error('La sesión terminó.');
  }
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.');
  return payload;
}
function headerMode(isSignedIn) {
  $('#siteHeader').hidden = !isSignedIn;
  $('#loginPage').hidden = isSignedIn;
  $('#appPage').hidden = !isSignedIn;
  if (isSignedIn) $('#userName').textContent = state.user?.name || '';
}
function roleCanEdit() { return ['editor', 'super_admin'].includes(state.user?.role); }
function roleIsSuper() { return state.user?.role === 'super_admin'; }

async function login(email, password) {
  const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  state.token = result.token;
  state.user = result.user;
  sessionStorage.setItem('myblogs-token', state.token);
  $('#loginError').hidden = true;
  headerMode(true);
  location.hash = '#/';
  await renderRoute();
}

async function loadCatalog(filters = {}) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  const [blogResult, categoryResult] = await Promise.all([
    api(`/blogs${params.size ? `?${params}` : ''}`), api('/categories')
  ]);
  state.blogs = blogResult.blogs;
  state.categories = categoryResult.categories;
}

function renderBlogCard(blog) {
  const date = blog.published_at ? new Date(blog.published_at).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const cover = blog.cover_url
    ? `<img src="${esc(blog.cover_url)}" alt="Portada de ${esc(blog.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;image-placeholder&quot;>My Blogs</div>'">`
    : '<div class="image-placeholder"><span>My Blogs</span></div>';
  return `<article class="blog-card">
    <a class="card-image" href="#/blog/${encodeURIComponent(blog.slug)}">${cover}</a>
    <div class="card-body">
      ${(blog.category_names || []).map(name => `<span class="tag">${esc(name)}</span>`).join(' ')}
      <h2><a href="#/blog/${encodeURIComponent(blog.slug)}">${esc(blog.title)}</a></h2>
      ${blog.author_name ? `<p class="card-author">Por ${esc(blog.author_name)}</p>` : ''}
      ${blog.description ? `<p>${esc(blog.description.slice(0, 145))}${blog.description.length > 145 ? '…' : ''}</p>` : ''}
      <div class="card-meta"><span>▢ &nbsp;${esc(date)}</span><a href="#/blog/${encodeURIComponent(blog.slug)}">Leer más <b>→</b></a></div>
    </div>
  </article>`;
}

async function renderHome() {
  await loadCatalog({ q: state.search, category: state.category });
  $('#viewRoot').innerHTML = `
    <section class="hero">
      <div class="hero-shape shape-left"></div><div class="hero-shape shape-bottom"></div>
      <div class="hero-copy"><p class="eyebrow">BIENVENIDO A MIS BLOGS</p><h1>Explora, lee y <span>descubre</span></h1>
        <p class="hero-text">Aquí encontrarás diferentes blogs sobre múltiples temas. Elige el que más te interese y sumérgete en cada historia, idea o experiencia.</p>
        <form class="search-form" id="searchForm"><span class="search-symbol">⌕</span><input name="q" value="${esc(state.search)}" placeholder="Buscar un blog..." aria-label="Buscar un blog"><button aria-label="Buscar" type="submit">⌕</button></form>
      </div>
      <div class="hero-art" aria-hidden="true"><div class="art-glow"></div><div class="art-laptop"><div class="art-screen"><span class="art-image">▧</span><i></i><i></i><i></i><i></i><i></i></div></div><div class="art-cup"></div><div class="art-plant">❧</div><span class="art-spark spark-one">／</span><span class="art-spark spark-two">〃</span></div>
    </section>
    <section class="content-section" id="blogs">
      <div class="category-row" id="categorias">
        <button class="category-chip ${state.category === '' ? 'selected' : ''}" data-category="">Todos</button>
        ${state.categories.map(category => `<button class="category-chip ${String(category.id) === state.category ? 'selected' : ''}" data-category="${category.id}">${esc(category.name)}</button>`).join('')}
      </div>
      ${(state.search || state.category) ? '<div class="results-heading"><h2>Resultados</h2><button class="clear-filter" id="clearFilter">Limpiar filtros ×</button></div>' : ''}
      <div class="blog-grid">${state.blogs.length ? state.blogs.map(renderBlogCard).join('') : '<div class="empty-state"><span>⌕</span><h2>No encontramos blogs</h2><p>Prueba con otra búsqueda o selecciona otra categoría.</p><button class="button" id="showAll">Ver todos los blogs</button></div>'}</div>
      <div class="closing-note"><span></span><b>◧</b><span></span><p>Cada blog es una nueva historia por descubrir</p></div>
    </section>`;
  $('#searchForm').addEventListener('submit', async event => { event.preventDefault(); state.search = new FormData(event.currentTarget).get('q').trim(); state.category = ''; await renderHome(); });
  $$('.category-chip').forEach(button => button.addEventListener('click', async () => { state.category = button.dataset.category; await renderHome(); document.querySelector('#blogs')?.scrollIntoView({ behavior: 'smooth' }); }));
  $('#clearFilter')?.addEventListener('click', async () => { state.search = ''; state.category = ''; await renderHome(); });
  $('#showAll')?.addEventListener('click', async () => { state.search = ''; state.category = ''; await renderHome(); });
}

async function renderBlog(slug) {
  const result = await api(`/blogs/${encodeURIComponent(slug)}`);
  const blog = result.blog;
  const isLocal = blog.integration_mode === 'local';
  $('#viewRoot').innerHTML = `<section class="detail-wrap">
      <a class="back-link" href="#/">← Volver a los blogs</a>
      ${blog.cover_url ? `<img class="detail-cover" src="${esc(blog.cover_url)}" alt="${esc(blog.title)}">` : ''}
      <div class="detail-content"><span class="tag">${esc((blog.category_names || []).join(', '))}</span><h1>${esc(blog.title)}</h1>
        <div class="detail-meta">${blog.author_name ? `Por ${esc(blog.author_name)} · ` : ''}${esc(blog.source_platform)}</div>
        ${blog.description ? `<p class="detail-description">${esc(blog.description)}</p>` : ''}
        ${isLocal ? '' : `<div class="integration-note"><h2>Continúa leyendo</h2><p>Abre el sitio original para continuar.</p><a class="button" href="${esc(blog.original_url)}" target="_blank" rel="noopener noreferrer">Visitar blog original ↗</a></div>`}
      </div>
    </section>${isLocal ? '<div class="reader-loading" id="readerLoading">Cargando el blog…</div><div class="blog-reader" id="blogReader" hidden></div>' : ''}`;
  if (isLocal) {
    const { html } = await api(`/blogs/${encodeURIComponent(slug)}/page`);
    const iframe = document.createElement('iframe');
    iframe.title = blog.title;
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.srcdoc = html;
    $('#readerLoading').hidden = true;
    const reader = $('#blogReader'); reader.hidden = false; reader.append(iframe);
  }
}

function setActiveNav(route) {
  const nav = $('#mainNav');
  $$('.main-nav a').forEach(anchor => anchor.classList.toggle('active', anchor.dataset.nav === route));
  nav.classList.remove('is-open');
  $('#menuToggle').setAttribute('aria-expanded', 'false');
}

async function renderAbout() {
  $('#viewRoot').innerHTML = `<section class="detail-wrap"><div class="detail-content"><p class="eyebrow">ACERCA DEL PROYECTO</p><h1>Un espacio para descubrir nuevas ideas.</h1><p class="detail-description">My Blogs reúne en un solo lugar blogs de distintos temas y plataformas. Cada ficha presenta información sobre el blog y permite visitar su contenido original.</p><p class="muted">Este sitio es una plataforma de descubrimiento; el contenido externo pertenece a sus respectivos autores.</p><a class="button" href="#/">Explorar blogs</a></div></section>`;
}

async function renderRoute() {
  if (!state.user) { headerMode(false); return; }
  const route = location.hash.replace(/^#\/?/, '');
  try {
    if (!route || route === '') { setActiveNav('home'); await renderHome(); }
    else if (route === 'about') { setActiveNav('about'); if (state.user.role === 'viewer') location.hash = '#/'; else await renderAbout(); }
    else if (route.startsWith('blog/')) { setActiveNav('blogs'); await renderBlog(decodeURIComponent(route.slice(5))); }
    else if (route === 'admin' || route.startsWith('admin/')) {
      if (!roleCanEdit()) { location.hash = '#/'; showFlash('Tu cuenta solo puede consultar los blogs.', 'error'); return; }
      const tab = route.split('/')[1] || 'blogs';
      if (tab === 'users' && !roleIsSuper()) { location.hash = '#/admin'; return; }
      setActiveNav(''); await renderAdmin(tab);
    } else { location.hash = '#/'; }
  } catch (error) {
    if (error.message !== 'La sesión terminó.') showFlash(error.message, 'error');
  }
}

async function renderAdmin(tab = 'blogs') {
  const categories = (await api('/categories')).categories;
  state.categories = categories;
  const blogs = (await api('/admin/blogs')).blogs;
  const users = tab === 'users' ? (await api('/admin/users')).users : [];
  const published = blogs.filter(blog => blog.status === 'published').length;
  const tabs = `<div class="portal-tabs" role="tablist">
    <button aria-selected="${tab==='blogs'}" data-tab="blogs">Blogs</button>
    <button aria-selected="${tab==='categories'}" data-tab="categories">Categorías</button>
    ${roleIsSuper() ? `<button aria-selected="${tab==='users'}" data-tab="users">Usuarios</button>` : ''}
  </div>`;
  let body = '';
  if (tab === 'blogs') body = renderBlogAdmin(blogs, categories);
  else if (tab === 'categories') body = renderCategoryAdmin(categories);
  else body = renderUserAdmin(users);
  $('#viewRoot').innerHTML = `<section class="portal-wrap"><div class="portal-heading"><div><p class="eyebrow">ESPACIO DE TRABAJO</p><h1>Panel de administración</h1><p class="muted">Hola, ${esc(state.user.name)}. Administra el contenido de tu plataforma.</p></div><div class="portal-actions"><a class="button" href="#/">Ver sitio ↗</a></div></div>
    <div class="stats-grid"><div class="stat-card"><span>Blogs registrados</span><strong>${blogs.length}</strong></div><div class="stat-card"><span>Publicados</span><strong>${published}</strong></div><div class="stat-card"><span>Categorías</span><strong>${categories.length}</strong></div></div>
    ${tabs}${body}</section>`;
  $$('.portal-tabs button').forEach(button => button.addEventListener('click', () => { state.editBlog = null; state.editUser = null; location.hash = `#/admin/${button.dataset.tab === 'blogs' ? '' : button.dataset.tab}`; }));
  if (tab === 'blogs') bindBlogAdmin();
  if (tab === 'categories') bindCategoryAdmin();
  if (tab === 'users') bindUserAdmin();
}

function renderBlogAdmin(blogs, categories) {
  const editing = state.editBlog;
  return `<div class="admin-columns">
    <section class="admin-panel" id="blog-form-panel"><h2>${editing ? 'Editar blog' : 'Agregar un blog'}</h2>
      <form id="blogForm" class="stack-form" enctype="multipart/form-data">
        <input type="hidden" name="id" value="${editing?.id || ''}">
        <label>Título<input name="title" required maxlength="200" value="${esc(editing?.title || '')}" placeholder="Mi blog de tecnología"></label>
        <label>Slug (URL corta)<input name="slug" required pattern="[a-zA-Z0-9-]+" value="${esc(editing?.slug || '')}" placeholder="mi-blog-de-tecnologia"></label>
        <label>Descripción<textarea name="description" rows="3" placeholder="¿De qué trata este blog?">${esc(editing?.description || '')}</textarea></label>
        <label>Autor<input name="author_name" value="${esc(editing?.author_name || '')}" placeholder="Nombre del autor"><small class="form-help">Este nombre aparecerá en el pie del blog.</small></label>
        <label>URL original<input type="url" name="original_url" value="${esc(editing?.original_url || '')}" placeholder="https://..."></label>
        <label>ZIP del blog local<input type="file" name="blog_zip" accept=".zip,application/zip"><small class="form-help">Debe contener index.html en la raíz. Hasta 20 MB comprimido y 50 MB descomprimido.${editing ? ' Déjalo vacío para conservar los archivos actuales.' : ''}</small></label>
        <label>Imagen de portada (opcional)<input type="url" name="cover_image" value="${esc(editing?.cover_image || '')}" placeholder="https://.../portada.jpg"></label>
        <fieldset class="category-picker"><legend>Categorías</legend>${categories.map(category => `<label class="check-label"><input type="checkbox" name="category_ids" value="${category.id}" ${(editing?.category_ids || []).map(Number).includes(Number(category.id)) ? 'checked' : ''}> ${esc(category.name)}</label>`).join('') || '<small class="form-help">Primero crea una categoría.</small>'}</fieldset>
        <div class="form-two"><label>Plataforma<select name="source_platform">${optionList(['blogger','canva','wordpress','custom','other'], editing?.source_platform || 'other')}</select></label>
          <label>Integración<select name="integration_mode">${optionList(['external','embed','local'], editing?.integration_mode || 'external')}</select></label></div>
        <label>Estado<select name="status">${optionList(['draft','published','archived'], editing?.status || 'draft')}</select></label>
        <label class="check-label"><input type="checkbox" name="is_featured" value="true" ${editing?.is_featured ? 'checked' : ''}> Destacar este blog</label>
        <div class="form-two"><button class="button button-wide" type="submit">${editing ? 'Guardar cambios' : 'Guardar blog +'}</button>${editing ? '<button class="button-secondary" type="button" id="cancelBlogEdit">Cancelar</button>' : ''}</div>
      </form>
    </section>
    <section class="admin-panel"><h2>Tus blogs</h2>${blogs.length ? `<div class="admin-list">${blogs.map(blog => `<div class="admin-list-item"><div class="admin-list-copy"><strong>${esc(blog.title)}</strong><small><span class="status-pill ${esc(blog.status)}">${esc(blog.status)}</span> · ${esc(blog.source_platform)}${blog.author_name ? ` · Por ${esc(blog.author_name)}` : ''}</small>${blog.original_url ? `<a class="admin-source-link" href="${esc(blog.original_url)}" target="_blank" rel="noopener noreferrer">Abrir sitio original ↗</a>` : ''}</div><div class="admin-list-actions"><button class="button button-small" data-edit-blog="${blog.id}">Editar</button><button class="danger-link" data-delete-blog="${blog.id}">Eliminar</button></div></div>`).join('')}</div>` : '<p class="muted">Todavía no hay blogs registrados.</p>'}</section>
  </div>`;
}

function optionList(values, selected) {
  const labels = { blogger: 'Blogger', canva: 'Canva', wordpress: 'WordPress', custom: 'HTML propio', other: 'Otra', external: 'Enlace externo', embed: 'Incrustado (iframe)', local: 'Local (HTML propio)', draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };
  return values.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${labels[value]}</option>`).join('');
}

function bindBlogAdmin() {
  const form = $('#blogForm');
  const title = $('input[name=title]', form); const slug = $('input[name=slug]', form);
  title.addEventListener('input', () => { if (!slug.dataset.edited) slug.value = slugify(title.value); });
  slug.addEventListener('input', () => { slug.dataset.edited = 'true'; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(form);
    formData.set('category_ids', JSON.stringify(formData.getAll('category_ids')));
    formData.set('is_featured', formData.get('is_featured') === 'true' ? 'true' : 'false');
    const id = formData.get('id');
    try {
      await api(id ? `/admin/blogs/${id}` : '/admin/blogs', { method: id ? 'PUT' : 'POST', body: formData });
      state.editBlog = null; showFlash(id ? 'Cambios guardados.' : 'Blog guardado y publicado en el catálogo.'); await renderAdmin('blogs');
    } catch (error) { showFlash(error.message, 'error'); }
  });
  $('#cancelBlogEdit')?.addEventListener('click', () => { state.editBlog = null; renderAdmin('blogs'); });
  $$('[data-edit-blog]').forEach(button => button.addEventListener('click', async () => {
    try { const result = await api('/admin/blogs'); state.editBlog = result.blogs.find(blog => Number(blog.id) === Number(button.dataset.editBlog)); await renderAdmin('blogs'); $('#blog-form-panel')?.scrollIntoView({ behavior: 'smooth' }); }
    catch (error) { showFlash(error.message, 'error'); }
  }));
  $$('[data-delete-blog]').forEach(button => button.addEventListener('click', async () => {
    const blog = button.closest('.admin-list-item').querySelector('strong').textContent;
    if (!confirm(`¿Eliminar “${blog}” y sus archivos? Esta acción no se puede deshacer.`)) return;
    try { await api(`/admin/blogs/${button.dataset.deleteBlog}`, { method: 'DELETE' }); showFlash('Blog eliminado.'); await renderAdmin('blogs'); }
    catch (error) { showFlash(error.message, 'error'); }
  }));
}

function renderCategoryAdmin(categories) {
  return `<section class="admin-panel"><h2>Categorías</h2><form id="categoryForm" class="category-form"><label>Nombre<input name="name" required placeholder="Ej. Tecnología"></label><label>Slug<input name="slug" required pattern="[a-zA-Z0-9-]+" placeholder="tecnologia"></label><button class="button" type="submit">Agregar categoría</button></form>
    <div class="category-admin-list">${categories.map(category => `<div><span>${esc(category.name)} <small>(${category.blog_count} blogs)</small></span><button class="danger-link" data-delete-category="${category.id}">Eliminar</button></div>`).join('')}</div>
    <p class="muted small">Puedes asignar una o varias categorías al crear o editar cada blog.</p></section>`;
}
function bindCategoryAdmin() {
  const form = $('#categoryForm'); const name = $('input[name=name]',form); const slug = $('input[name=slug]',form);
  name.addEventListener('input',()=>{if(!slug.dataset.edited)slug.value=slugify(name.value)}); slug.addEventListener('input',()=>{slug.dataset.edited='true'});
  form.addEventListener('submit',async event=>{event.preventDefault();try{await api('/admin/categories',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});showFlash('Categoría agregada.');await renderAdmin('categories')}catch(error){showFlash(error.message,'error')}});
  $$('[data-delete-category]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('¿Eliminar esta categoría?'))return;try{await api(`/admin/categories/${button.dataset.deleteCategory}`,{method:'DELETE'});showFlash('Categoría eliminada.');await renderAdmin('categories')}catch(error){showFlash(error.message,'error')}}));
}

function renderUserAdmin(users) {
  const user = state.editUser;
  return `<section class="admin-panel"><h2>Usuarios registrados (${users.length})</h2>${users.length?`<div class="admin-list">${users.map(item=>`<div class="admin-list-item"><div class="admin-list-copy"><strong>${esc(item.name)}${Number(item.id)===Number(state.user.id)?' (tu cuenta)':''}</strong><small>${esc(item.email)}</small><small>Rol: ${esc(item.role)} · ${item.is_active?'Activo':'Desactivado'}</small></div><div class="admin-list-actions"><button class="button button-small" data-edit-user="${item.id}">Editar</button>${Number(item.id)!==Number(state.user.id)?`<button class="danger-link" data-delete-user="${item.id}">Eliminar</button>`:''}</div></div>`).join('')}</div>`:'<p class="muted">Todavía no hay usuarios.</p>'}</section>
    <section class="admin-panel user-form"><h2>${user?'Editar usuario':'Crear usuario'}</h2><p class="muted">Las contraseñas deben tener al menos 12 caracteres.</p><form id="userForm" class="stack-form"><input type="hidden" name="id" value="${user?.id||''}">
      <label>Nombre completo<input name="name" required maxlength="120" value="${esc(user?.name||'')}" placeholder="Nombre del usuario"></label>
      <label>Correo electrónico<input name="email" type="email" required maxlength="190" value="${esc(user?.email||'')}" placeholder="usuario@correo.com"></label>
      <label>${user?'Nueva contraseña (opcional)':'Contraseña'}<input name="password" type="password" minlength="12" ${user?'':'required'} autocomplete="new-password" placeholder="Mínimo 12 caracteres"></label>
      <label>Rol<select name="role">${optionList(['editor','super_admin','viewer'],user?.role||'editor')}</select></label>
      <label class="check-label"><input name="is_active" type="checkbox" value="true" ${!user||user.is_active?'checked':''}> Cuenta activa</label>
      <div class="form-two"><button class="button button-wide" type="submit">${user?'Guardar cambios':'Crear usuario'}</button>${user?'<button class="button-secondary" type="button" id="cancelUserEdit">Cancelar</button>':''}</div>
    </form></section>`;
}
function bindUserAdmin() {
  $('#userForm').addEventListener('submit',async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const id=form.get('id');const payload={name:form.get('name'),email:form.get('email'),password:form.get('password'),role:form.get('role'),is_active:form.get('is_active')==='true'};try{await api(id?`/admin/users/${id}`:'/admin/users',{method:id?'PUT':'POST',body:JSON.stringify(payload)});state.editUser=null;showFlash(id?'Usuario actualizado.':'Usuario creado.');await renderAdmin('users')}catch(error){showFlash(error.message,'error')}});
  $('#cancelUserEdit')?.addEventListener('click',()=>{state.editUser=null;renderAdmin('users')});
  $$('[data-edit-user]').forEach(button=>button.addEventListener('click',async()=>{try{const result=await api('/admin/users');state.editUser=result.users.find(item=>Number(item.id)===Number(button.dataset.editUser));await renderAdmin('users')}catch(error){showFlash(error.message,'error')}}));
  $$('[data-delete-user]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('¿Eliminar definitivamente este usuario?'))return;try{await api(`/admin/users/${button.dataset.deleteUser}`,{method:'DELETE'});showFlash('Usuario eliminado.');await renderAdmin('users')}catch(error){showFlash(error.message,'error')}}));
}

$('#loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('button[type=submit]', event.currentTarget);
  button.disabled = true;
  $('#loginError').hidden = true;
  try { const form = new FormData(event.currentTarget); await login(form.get('email'), form.get('password')); }
  catch (error) { showFlashOnLogin(error.message); }
  finally { button.disabled = false; }
});
$('#logoutButton').addEventListener('click', () => signOut());
$('#menuToggle').addEventListener('click', () => { const open = $('#mainNav').classList.toggle('is-open'); $('#menuToggle').setAttribute('aria-expanded', String(open)); });
$$('#mainNav a').forEach(link => link.addEventListener('click', () => { $('#mainNav').classList.remove('is-open'); $('#menuToggle').setAttribute('aria-expanded','false'); }));
$$('.main-nav a').forEach(link => link.addEventListener('click', event => {
  const nav = link.dataset.nav;
  if (nav === 'blogs' || nav === 'categories') { event.preventDefault(); location.hash = '#/'; setTimeout(() => document.getElementById(nav)?.scrollIntoView({ behavior: 'smooth' }), 150); }
}));
const theme = localStorage.getItem('myblogs-theme'); if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
$('#themeToggle').addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; localStorage.setItem('myblogs-theme', dark ? 'dark' : 'light'); });
window.addEventListener('hashchange', renderRoute);

async function init() {
  if (state.token) {
    try { state.user = (await api('/auth/me')).user; headerMode(true); await renderRoute(); return; }
    catch { sessionStorage.removeItem('myblogs-token'); state.token='';state.user=null; }
  }
  headerMode(false);
  if (!API || API.includes('YOUR-MYBLOGS-API')) showFlashOnLogin('Antes de entrar, configura la URL de la API de Render en frontend/config.js.');
}
init();
