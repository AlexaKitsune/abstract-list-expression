# ALE-5L — Consolidación Git del Release Candidate 0.1.0

Fecha: 2026-10-28.

## Resultado

El candidato quedó identificado por el commit local `1a6bd67022e55be32ca583a6cee096ef823dbdb7` (`feat: prepare ALE 0.1.0 release candidate`). Se ejecutó la suite bajo Node.js 22.23.4 y se generó e instaló el tarball desde esa revisión. No se publicó el paquete ni se creó tag o push.

El working tree estaba limpio inmediatamente después del commit de release. Este informe se añade en un commit de documentación separado porque el hash de la revisión de release no puede escribirse dentro de esa misma revisión sin cambiar su propio hash. El commit separado no modifica ningún archivo incluido en npm.

## 1. Revisión de Git y archivos

Antes del commit se inspeccionaron las diferencias rastreadas, la lista completa de archivos no rastreados y las reglas de `.gitignore`. El conjunto aprobado incluyó 60 archivos: implementación, README, changelog, contribución, licencia, pruebas, fixtures de conformidad, especificación, auditorías históricas y scripts/corpus/resultados de benchmarks reproducibles.

Se conservaron los benchmarks en Git. `package.json` limita el paquete npm a los archivos del runtime, documentación normativa y de benchmark seleccionada, licencia y fixtures portables. Por tanto, `benchmarks/` y `tests/` no entran al tarball.

`.gitignore` ignora `node_modules/`, logs de npm/yarn/pnpm y `.DS_Store`. Las excepciones de `docs/` permiten rastrear los informes históricos seleccionados y los informes ALE-5K y ALE-5L. `docs/.DS_Store` y `node_modules/` permanecen ignorados. La inspección de nombres y un escaneo de patrones de secretos no encontró archivos sensibles; las menciones a `/private/tmp` y `/Users/alexa` encontradas por búsqueda son texto de comandos históricos en informes, no rutas operativas ni credenciales.

Se ejecutó `git diff --cached --check`. Hubo avisos de whitespace heredados en archivos nuevos; se eliminaron espacios finales y líneas vacías sobrantes. En el ejemplo histórico de la tabla nula, los cuatro espacios de salida se hicieron visibles como `␠␠␠␠` para conservar la explicación sin whitespace al final de línea.

## 2. Commit

- Commit de release: `1a6bd67022e55be32ca583a6cee096ef823dbdb7`.
- Mensaje: `feat: prepare ALE 0.1.0 release candidate`.
- Archivos: 60; 13.590 inserciones y 665 eliminaciones.
- `git diff --cached --check`: pasó antes de crear el commit.
- No se ejecutaron `git push`, `git tag` ni `npm publish`.

## 3. Entorno y validación

- Node.js: `v22.23.4`.
- npm: `10.9.9`.
- `npm test`: 81 aprobadas, 0 fallidas, 0 pendientes.
- `git diff --check`: pasó.
- `package.json` y `package-lock.json`: nombre, versión `0.1.0` y `engines.node >=22.0.0` coherentes.
- No se modificó gramática, API ni dialectos en esta consolidación.

La primera ejecución de `npm pack` intentó usar el caché global de npm y falló porque ese directorio contenía archivos con propietario distinto. No se cambió la instalación ni sus permisos; repetir con caché/logs bajo `/private/tmp` funcionó.

## 4. Tarball desde el commit

El paquete se generó con Node 22.23.4 mediante:

```sh
npm_config_cache=/private/tmp/ale-5l-npm-cache \
npm_config_logs_dir=/private/tmp/ale-5l-npm-logs \
npm pack --json --pack-destination=/private/tmp/ale-5l-from-commit
```

Artefacto: `alexa.kitsune-ale-0.1.0.tgz`.

- SHA-256: `b0cd4feac0cebfe156f67b32e83d3087d1c0cdcfae16ab5d6dfbe647bfde7d3c`.
- npm shasum: `51981181fdf872d391bd74c62c0a4a6511f33ab2`.
- SRI: `sha512-1J7o79oBGOazKoMScvHyIynWoZbe/V3YCiDYJN4TXPU8jscQpN9+U9JsJqAyWHm1EmQGT9GXEBQa10TOJIg/dw==`.
- Tamaño comprimido/desempaquetado: 38.648 / 137.175 bytes.
- 10 archivos; no se empaquetan dependencias.

El manifiesto contiene `CHANGELOG.md`, `LICENSE`, `README.md`, `ale.js`, `package.json`, `conformance/README.md`, `conformance/ale-conformance.json`, `docs/specification.md`, `docs/ale-5b1-results.md` y `docs/ale-5f-results.md`.

### Comparación con ALE-5K

ALE-5K registró SHA-256 `3bda540c6b377ee619bff7f461e2a7bbad4a2079518b692a81a26919d74e6aa1`, npm shasum `b8fd941a6298989a450223b2e1b38f2e4bdf7fa7`, 38.650 bytes comprimidos y 137.176 desempaquetados. El archivo tarball original de 5K ya no estaba disponible en los directorios temporales; el hash quedó como referencia registrada. El tarball precommit regenerado en esta sesión sí coincidió byte por byte con ese SHA-256 de 5K.

Al limpiar whitespace antes del commit se eliminó una línea vacía final de `CHANGELOG.md`. Al comparar ambos tarballs extraídos, los otros nueve archivos coinciden byte por byte y `CHANGELOG.md` difiere solamente en esa línea vacía. Por ese cambio textual menor, el contenido empaquetado no es idéntico en sentido estricto y los tarballs tampoco son byte idénticos. El tarball del commit tiene 2 bytes menos comprimido y 1 byte menos desempaquetado. No hay diferencias de runtime, API, documentación sustantiva, fixtures ni licencia.

La licencia MIT incluida conserva el SHA-256 `cdf6240126cf5f23b05a0500d4d36c98a3169ddda0fce383a637745490c503aa`. El tarball no contiene `node_modules`, `.git`, `.DS_Store`, tests, benchmarks, secretos ni rutas locales.

## 5. Instalación independiente

El tarball se instaló offline en `/private/tmp/ale-5l-consumer`, fuera del checkout. El smoke test ESM importó `parseALE` y `stringifyALE` desde `@alexa.kitsune/ale` y verificó round-trip en `current`, `legacy` y `next`, incluyendo `__proto__`, `constructor` y `prototype` como propiedades propias. Pasó. `npm ls --all --depth=0` mostró solamente `@alexa.kitsune/ale@0.1.0`; no hay dependencias runtime.

Un primer fixture de smoke usó un objeto con prototipo nulo y falló por diferencia de prototipo. Ese valor está fuera del dominio JSON soportado, por lo que se reemplazó por un objeto ordinario con `__proto__` definido como propiedad propia. La prueba corregida pasó y no motivó cambios al paquete.

## 6. Compatibilidad y contenido histórico

- `current` permanece como dialecto predeterminado.
- `legacy` sigue disponible para compatibilidad.
- `next` permanece experimental.
- ESM es la interfaz soportada.
- El cambio de versión local es `0.1.0`; no se publicó.
- Se conservaron auditorías y mediciones previas en Git para trazabilidad. Los informes históricos no fueron reescritos salvo la corrección de whitespace indicada.

## 7. Estado final y limitaciones

El commit de release identifica el código y metadatos de los que se construyó el tarball. No se modificó el árbol tras ese commit antes de empacar. Este informe añade un commit documental posterior; como `docs/ale-5l-git-release.md` no figura en el campo `files` de npm, ese commit no cambia el artefacto de distribución. Debe repetirse `npm pack` desde el HEAD final para confirmar el mismo SHA-256 antes de dar por cerrada la revisión documental.

No se verificó el registro npm en esta fase; no se necesita para la consolidación Git y no se publicó. No se creó `v0.1.0`. El tarball previo de ALE-5K no estaba archivado, así que la comparación exacta se basó en el hash guardado en `docs/ale-5k-release-candidate.md` y en el artefacto precommit recreado localmente.
