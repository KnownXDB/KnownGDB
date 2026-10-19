# Gobernanza

Autor y mantenedor inicial: Mauricio Vuljevas (@mvuljevas).
Repositorio canónico: https://github.com/KnownXDB/KnownGDB.

KnownGDB es autónomo. Ningún consumidor, proveedor o producto externo determina
su modelo. No hay dominio oficial definido en estos fundamentos.

Código y documentación original bajo MIT, según LICENSE. La licencia no concede
derechos sobre marcas, medios o datos externos. Los assets y datos requieren
procedencia y condiciones de distribución propias. Contribuciones conservan
autoría. No presentar forks como servicio oficial.

Decisiones estructurales requieren ADR. Cambios de permisos, visibilidad,
publicación y configuración de infraestructura requieren autorización explícita
del mantenedor. Reiniciar Git no autoriza borrar Supabase o R2.

Contribuciones externas requieren revisión del mantenedor. Nadie simula una
aprobación independiente de su propio cambio. Mientras haya un único mantenedor,
verificar CI y documentar revisión manual; añadir revisión independiente al
incorporar otro mantenedor. Escritura solo para mantenedores autorizados.

`develop` es la rama predeterminada; recibe trabajo mediante PRs y verificaciones.
`main` recibe promociones estables desde `develop`, con evidencia de pruebas del
commit integrado. No hay merge ni despliegue automáticos. Consultar
[flujo de Git](docs/GIT-WORKFLOW.md) y [ADR 0002](docs/adr/0002-repository-governance.md).
Las protecciones reales y su aplicación a administradores se verifican en GitHub.
Trato respetuoso y sin acoso ni discriminación. No publicar secretos, contenido
externo ni información privada como parte de una contribución.
