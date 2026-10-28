# ALE-5H — Preparación de publicación 0.1.0

Fecha de auditoría: 2026-10-27. No se publicó el paquete y la versión sigue en 0.0.2.

## Veredicto

# NOT READY

El tarball se puede instalar y usar como ESM en los runtimes probados, pero hay bloqueantes previos a una publicación:

1. package.json declara MIT, pero no existe el archivo LICENSE. No se inventó texto legal ni titular/año.
2. No se declara engines. Object.hasOwn requiere Node 16.9.0 o posterior; se corrigió el comentario de ale.js que decía genéricamente Node >=16. No había Node 16 disponible para probar el mínimo ni npm test allí.
3. El soporte CommonJS no está declarado. Solo se define una exportación ESM.

El consumidor puede usar hoy el artefacto de prueba, pero el estado de licencia y el mínimo de Node deben resolverse antes de etiquetar 0.1.0.

## Estado del repositorio y alcance

Al iniciar la fase seguían presentes cambios de trabajo de ALE-1–5G en .gitignore, README.md, ale.js, package.json y los directorios no rastreados benchmarks/, conformance/, docs/, tests/ y package-lock.json. No se descartaron ni confirmaron esos cambios. ALE-5H modificó el listado files de package.json para incluir la especificación, fixtures portables y documentos enlazados por README; aclaró README sobre ESM, errores y las limitaciones de round-trip de legacy; precisó el comentario de versión mínima del runtime en ale.js sin cambiar código ejecutable; creó CHANGELOG.md, CONTRIBUTING.md y este informe. No cambió la versión, la API, los dialectos ni sus valores predeterminados.

El paquete sigue exponiendo solo parseALE y stringifyALE. parseALE comunica el error por un objeto Error con name ALEParseError; no exporta una clase de error para instanceof.

## Auditoría de distribución

Identidad: @alexa.kitsune/ale@0.0.2. type es module; main y exports apuntan a ale.js. Por tanto, la interfaz publicada es ESM. No hay una condición exports.require ni un artefacto CommonJS.

Dependencias: toon, js-tiktoken y js-yaml son devDependencies y no se incluyen en el tarball ni son necesarias para parseALE/stringifyALE. En el proyecto consumidor temporal, npm ls --all --depth=0 mostró solamente el paquete ALE. No se añadieron dependencias.

El tarball final de auditoría contiene nueve archivos:

- ale.js, package.json, README.md y CHANGELOG.md.
- docs/specification.md, docs/ale-5b1-results.md y docs/ale-5f-results.md.
- conformance/README.md y conformance/ale-conformance.json.

Excluye tests/, benchmarks/, node_modules/, .git, .DS_Store, documentos históricos no enlazados y archivos locales. Un escaneo del artefacto extraído no detectó patrones de llaves privadas, tokens comunes ni rutas /Users/alexa o /private/tmp. El tarball no contiene LICENSE porque ese archivo no existe. La propiedad license: MIT del metadata no sustituye el archivo requerido para distribuir el texto de licencia.

package.json incluye LICENSE bajo files, pero npm lo omite silenciosamente al faltar. No se corrigió ese vacío legal.

## Instalación independiente

Se ejecutó npm pack --dry-run --json y npm pack; luego se instaló el tarball desde /private/tmp/ en un proyecto temporal con npm install --offline --ignore-scripts. La instalación añadió solo @alexa.kitsune/ale@0.0.2. Importar por el nombre del paquete resolvió a node_modules/@alexa.kitsune/ale/ale.js, sin ruta al checkout.

La prueba ESM desde el consumidor externo comprobó parseALE/stringifyALE, objetos y arrays, opciones indent/useTables/useSpread/booleanShortcuts/inlineArrayMax, current/legacy/next, el contraste de 1e3, el quoting de strings exponent-like, ALEParseError por name y claves propias __proto__/constructor/prototype.

require() cargó el módulo en Node 20.19.6 y 24.21.0 y devolvió parseALE/stringifyALE. Este resultado solo confirma el soporte runtime observado para cargar ESM síncrono en esas versiones; el paquete no declara CommonJS ni promete que require funcione en toda versión admitida. README ahora explicita ESM como interfaz publicada.

La primera invocación de npm pack falló porque el sandbox no permitió escribir/limpiar el log configurado en /Users/alexa/.npm/_logs. Las repeticiones con npm_config_cache=/private/tmp/ale-npm-cache y npm_config_logs_dir=/private/tmp/ale-npm-logs funcionaron. Es una restricción del entorno de auditoría, no un error del paquete.

## Node y engines

No hay campo engines. La implementación invoca Object.hasOwn en la ruta de claves duplicadas; esta API está disponible desde Node 16.9.0 según las notas oficiales de [Node.js 16.9.0](https://nodejs.org/en/blog/release/v16.9.0). El comentario se actualizó para excluir Node 16.0–16.8, que no satisfacen ese mínimo.

Se ejecutó npm test completo con:

- Node 20.19.6: 81 aprobadas, cero fallidas.
- Node 24.21.0: 81 aprobadas, cero fallidas.

Node 24 fue el runtime LTS reciente disponible. No se encontró Node 16 instalado; no se descargó ni instaló otro runtime. El mínimo efectivo y el soporte de ramas Node deben decidirse y verificarse antes del release. El uso de node:test en la suite también significa que validar npm test en Node 16 requiere revisar primero el soporte del runner, aunque eso no es dependencia runtime del paquete.

## Contrato público y documentación

README incluye instalación npm, import ESM, ejemplo ALE y valor equivalente, tipos, límites, dialectos, opciones, seguridad de claves y advertencia sobre benchmarks. Se aclaró que solo se exportan dos funciones y que el error se identifica por name. También se aclaró que legacy puede no preservar todas las estructuras JSON modernas al serializar, en particular algunas formas vacías.

CHANGELOG.md identifica 0.1.0 como propuesta no publicada y no altera la versión. CONTRIBUTING.md documenta dialectos, pruebas, regresiones y precauciones con datos. No se creó LICENSE ni se alteró license: MIT.

La entrada examples del README se ejecutó mediante la prueba existente tests/conformance.test.js. Las reglas normativas y fixtures relevantes se incluyen ahora en el tarball.

## Conformidad portable

conformance/ale-conformance.json contiene casos, dialectos, resultados por dialecto, errores esperados, canonicalización y el valor especial -0 mediante bits binary64. conformance/README.md describe el formato sin requerir JavaScript. tests/conformance-fixtures.test.js es solo el runner de la implementación ALE, no una dependencia del fixture.

SHA-256 de conformance/ale-conformance.json: 99415c2f4970e04016f57fff027df6c841d8da765bde63dd1268dd59055903e5. El tarball final de auditoría tuvo SHA-256 127c3f0ce9a40a9009ed908f8d974ff8151f5c0a6a5442afe976fa0d4a0c3884, shasum npm f5e5488c588d56b765202755e1625558c1dbce31 e integrity sha512-Njo120Q5AyvZa81einHKSFCkbh26pwm1FKH9nH0VsS970tSKATHY/gZWQY81FXdRnzU6UwhWTDQjzaVPrUl2Qg==. No hay revisión Git confirmada asociada, porque no se realizaron commits. No se probó una segunda implementación independiente; por ello no se afirma interoperabilidad multi-runtime.

## Robustez y recursos

Se repitió la campaña determinista de ALE-5G. Las profundidades 4, 8, 16 y 32 completaron 903 round-trips cada una, con siete opciones (3.612 total). El fuzz ejecutó 1.000 entradas en proceso hijo con timeout de 20 segundos y evaluó los tres dialectos: 0 excepciones inesperadas, 0 alteraciones de prototipos, 0 ejecución de contenido. Hubo 55 diferencias current/legacy esperadas por compatibilidad.

El timeout intermitente de ALE-5G no se redujo a una entrada individual. En una ejecución bajo carga el proceso excedió el límite; el mismo corpus aislado se completó en las repeticiones finales. Esto es sensible a presión de CPU/ejecuciones simultáneas y no demuestra ausencia de problemas de rendimiento.

La campaña de tamaño midió documentos de aproximadamente 1 KB, 10 KB, 100 KB y 1 MB. En Node 24 la entrada de 1 MB con unas 80.660 propiedades tomó aproximadamente 252 ms para parsear, 50 ms para serializar y 172 ms para reparsear en la ejecución registrada. Son medidas de una sola muestra, no garantías. El parser y serializador son recursivos y no definen límites públicos de profundidad, tamaño o cantidad de propiedades. Un consumidor que acepte ALE no confiable debe imponer límites externos; la suite no demuestra resistencia a agotamiento de recursos.

## Resultados repetibles

Comandos ejecutados:

~~~sh
npm test
ALE_SEED=1243488294 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=1 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=3735928559 ALE_CASES=10000 node --test tests/generative.test.js
ALE_SEED=8675309 ALE_CASES=10000 node --test tests/generative.test.js
node benchmarks/ale-5f/next-campaign.mjs
node benchmarks/ale-5f/next-numeric-campaign.mjs
node benchmarks/ale-5c/numeric-roundtrip.mjs
node tests/robustness-campaign.js
npm_config_cache=/private/tmp/ale-npm-cache npm_config_logs_dir=/private/tmp/ale-npm-logs npm pack --dry-run --json
~~~

Resultados:

- 81/81 pruebas en Node 20.19.6 y Node 24.21.0.
- Current: 280.000 round-trips, cuatro semillas, cero fallos.
- Next: 70.000 round-trips y 3.612 casos de profundidad, cero fallos.
- Numeric current: 99.937 patrones finitos revisados, cero fallos.
- Numeric next: 100.000 valores exactos y estabilidad canónica, cero fallos.
- Profundidad current: 3.612 round-trips; fuzz: 1.000 fuentes × tres dialectos, sin fallos internos inesperados.
- npm pack: 9 archivos y 135.715 bytes desempaquetados; npm install offline del tarball pasó.
- git diff --check: pasó.

## Bloqueantes y requisitos para 0.1.0

1. Confirmar titular y año del copyright; agregar el archivo LICENSE que corresponde a la licencia MIT ya declarada, o cambiar el metadata con autorización explícita.
2. Decidir el rango de Node soportado, declarar engines y probar el límite mínimo exacto. No equiparar el comentario Node >=16 con una validación de Node 16.0.
3. Decidir si CommonJS queda fuera de soporte (recomendación actual: sí; documentar ESM) o preparar y probar una entrada dual antes de prometerlo.
4. Congelar fixtures portables mediante una revisión identificable y checksum de release; conseguir una segunda implementación que los consuma antes de anunciar interoperabilidad.
5. Repetir fuzz y límites de recursos en un job controlado, con timeout y memoria máximos explícitos en CI.
6. Revisar el tarball final, hash, metadata, README y changelog justo antes de publicar. No publicar desde este informe.

## Recomendación

El artefacto técnico es instalable fuera del checkout y la API ESM básica funciona en los dos runtimes probados. Aun así, no se recomienda publicar 0.1.0 hasta resolver licencia y engines, y fijar por escrito que CommonJS no está soportado o implementar una entrada explícita. No promover next ni cambiar el dialecto predeterminado como parte de esta preparación.
