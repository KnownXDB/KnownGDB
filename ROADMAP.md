# Roadmap

Estado: fundamentos. La implementación anterior ha sido retirada del árbol de
trabajo. Este documento describe trabajo futuro, no capacidades disponibles.

## 0. Fundamentos

- [x] Conservar autonomía, políticas del dominio, seguridad, gobernanza y licencia.
- [x] Registrar arquitectura orientada al desarrollo local.
- [x] Separar responsabilidades de web, admin, API y plataformas.
- [x] Retirar implementación, dependencias y configuraciones del enfoque anterior.

## 1. Workspace local

- React + Vite + TypeScript + Tailwind para web y admin independientes.
- npm workspaces; contratos y componentes compartidos pequeños.
- Comandos simples de desarrollo, formato, lint, tipos, tests y build.
- HMR directo; sin Docker, certificados locales ni build previo del backend
  para trabajar en frontend.
- API local con proxy de Vite; fixtures explícitos y deterministas para diseño.
- [x] CI de higiene del repositorio y secretos, sin despliegue implícito.
- [x] Flujo protegido de ramas, asignación de PRs y proyecto de tracking.
- CI de aplicación (lint, tipos, tests y build) al implementar el workspace.
- Aceptación: una instalación limpia inicia ambas interfaces por separado,
  refleja cambios con HMR y construye cada aplicación de manera independiente.

## 2. Conexión de infraestructura

- Inspeccionar Supabase existente: esquema, migrations, Auth, RLS y permisos.
- Establecer baseline sin recrear ni sobrescribir datos remotos.
- Configurar conexión local a un entorno de desarrollo autorizado de Supabase.
- Opción local con CLI oficial para cambios aislados en base de datos.
- Worker con R2 privado y almacenamiento local para desarrollo de assets.
- Documentar variables privadas, bindings y despliegue manual en Cloudflare.
- Aceptación: lectura real por API con permisos comprobados; pruebas de
  autorización negativa; ninguna credencial privilegiada en bundles.

## 3. Experiencia pública

- Definir tokens, tipografía, navegación, densidad y estados responsive.
- Catálogo visual centrado en assets: búsqueda, filtros, galería y detalle.
- Diferenciar Game, releases, idiomas, procedencia y estado de publicación.
- Estados vacíos, carga y error; accesibilidad, teclado y contraste comprobados.
- Diseño premium con identidad propia y contenido autorizado.

## 4. Administración

- Diseño premium propio, navegación y build independientes de la web pública.
- Sesiones individuales y autorización en API, con auditoría.
- Catálogo, traducciones, releases, identidad, assets y moderación.
- Formularios y operaciones reales con validación y feedback.
- MFA, revocación y recuperación comprobadas antes de producción.

## 5. Publicación y evolución

- API versionada, acceso, planes, scopes, cuotas y controles de abuso.
- Validar backups, recuperación, derechos y políticas antes de publicación.
- Despliegues explícitos, observables y recuperables.
- Búsqueda dedicada, trabajos asíncronos y multimedia cuando la evidencia
  justifique su coste.
