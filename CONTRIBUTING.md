# Contribuir a ALE

## Antes de proponer cambios

- Lee README.md y docs/specification.md.
- Identifica el dialecto afectado. No cambies silenciosamente el significado de current o legacy.
- Para cambios de gramática o semántica, documenta ejemplos válidos, inválidos y las implicaciones de migración antes de implementar.
- Mantén next optativo y experimental salvo decisión explícita de release.

## Cambios y pruebas

- Añade una prueba de regresión mínima para cada defecto.
- Ejecuta npm test y git diff --check.
- Para cambios de round-trip, prueba los valores con igualdad estructural estricta y considera propiedades ausentes, null y -0.
- Para cambios de parser, incluye comportamiento de legacy si la ruta es compartida.
- No añadas dependencias runtime sin justificación.

No incluyas datos privados, tokens de acceso ni archivos locales. No cambies la versión ni publiques artefactos como parte de una contribución ordinaria.
