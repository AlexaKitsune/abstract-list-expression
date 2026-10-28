# ALE-5I — Resolución de bloqueantes para 0.1.0

Fecha: 2026-10-27. El paquete permanece en 0.0.2 y no se publicó.

## Veredicto

# CONDITIONAL

El bloqueante de licencia quedó resuelto, el tarball incorpora la licencia MIT y la instalación ESM aislada funciona. La versión propuesta de Node 22 no está disponible en este entorno; por instrucción, no se añadió engines y no se afirma compatibilidad verificada con Node 22. El release queda condicionado a decidir si el soporte probado en Node 20/24 basta o si se exige validar Node 22 antes de fijar un mínimo.

## 1. Licencia

Se creó LICENSE en la raíz con el texto íntegro estándar de MIT y el encabezado autorizado:

~~~text
MIT License

Copyright (c) 2026 Alexa N C
~~~

package.json ya declara license: MIT y files incluye LICENSE. Se comparó el archivo fuente con la copia extraída del tarball mediante cmp; coincidieron. No se añadieron restricciones.

SHA-256 de LICENSE: cdf6240126cf5f23b05a0500d4d36c98a3169ddda0fce383a637745490c503aa.

## 2. Node y engines

Se comprobó la disponibilidad local en rutas estándar de Homebrew y comandos node22, y se inspeccionaron los gestores locales disponibles. No se encontró Node 22 y no se descargó ni instaló otro runtime.

Versiones comprobadas:

| Runtime | Suite completa | Resultado |
|---|---:|---|
| Node 20.19.6 | sí | 81 aprobadas, 0 fallos |
| Node 24.21.0 | sí | 81 aprobadas, 0 fallos |
| Node 22 | no disponible | sin afirmación de compatibilidad |

package.json no declara engines. Por tanto, no se añadió el rango >=22.0.0. README identifica las versiones efectivamente probadas y aclara que Node 22 no fue verificado. ale.js conserva el comentario de mínimo de API Node 16.9 debido a Object.hasOwn, pero eso no constituye una declaración de soporte ni una prueba de esa versión. La suite usa node:test; el mínimo del runner de pruebas también debe separarse del mínimo del runtime de la biblioteca.

## 3. Interfaz ESM

Se mantuvieron type: module, main y exports apuntando a ale.js. Solo se garantizan las exportaciones parseALE y stringifyALE mediante ESM. CommonJS no tiene una entrada publicada ni garantía, aunque versiones concretas de Node puedan cargar un módulo ESM síncrono mediante require().

El consumidor externo importó desde @alexa.kitsune/ale, sin ruta al checkout. El smoke test pasó bajo Node 20.19.6 y 24.21.0.

## 4. Empaquetado e instalación

Comandos realizados con directorios temporales de npm para logs/cache:

~~~sh
npm_config_cache=/private/tmp/ale-npm-cache npm_config_logs_dir=/private/tmp/ale-npm-logs npm pack --dry-run --json --pack-destination=/private/tmp
npm_config_cache=/private/tmp/ale-npm-cache npm_config_logs_dir=/private/tmp/ale-npm-logs npm pack --pack-destination=/private/tmp
npm_config_cache=/private/tmp/ale-npm-cache npm_config_logs_dir=/private/tmp/ale-npm-logs npm install --offline --ignore-scripts /private/tmp/alexa.kitsune-ale-0.0.2.tgz
~~~

La instalación fue en un directorio temporal ajeno al repositorio y no accedió a la red. npm ls --all --depth=0 mostró solo @alexa.kitsune/ale; no hay dependencias runtime.

El tarball de esta auditoría incluyó 10 archivos: CHANGELOG.md, LICENSE, README.md, ale.js, package.json, los dos archivos de conformance y tres documentos incluidos bajo docs/. El tamaño fue 38.637 bytes comprimido y 137.119 bytes desempaquetado. No incluyó node_modules, tests, benchmarks, .git ni .DS_Store. Un escaneo de patrones comunes de secretos y rutas locales no encontró coincidencias.

SHA-256 del tarball: f0a9fda00a74fc54c875946720eac19679d0323a948fb4598a7da7156c434885.

SHA-1/shasum reportado por npm: 09e97b93fca1ed356cedd9a79aeb9b2e695ca141.

SHA-256 del fixture portable conformance/ale-conformance.json: 99415c2f4970e04016f57fff027df6c841d8da765bde63dd1268dd59055903e5.

Los hashes identifican el artefacto de esta auditoría, no el release futuro; cualquier cambio de archivo requerirá generar y revisar un tarball nuevo.

## 5. Prueba externa de API

Desde el proyecto temporal se importaron únicamente las funciones exportadas y se comprobó:

- Parse/stringify de un objeto sencillo en current, legacy y next.
- La diferencia de 1e3: string en current/legacy y número en next.
- Quoting y reversibilidad de strings exponent-like en next.
- Opciones documentadas de representación en current.
- Error de parseo identificado por name ALEParseError.
- Claves propias __proto__, constructor y prototype sin cambio del prototipo.
- El módulo expone solo parseALE y stringifyALE.

El README y el CHANGELOG declaran MIT, ESM, next experimental y el estado propuesto/no publicado de 0.1.0. CONTRIBUTING.md y los fixtures portables se conservaron. No se cambió versión, gramática, API ni dialecto predeterminado.

## 6. Validación

La suite pasó en ambos runtimes disponibles: 81/81 en Node 20.19.6 y 81/81 en Node 24.21.0. No hubo regresiones.

Campañas ejecutadas:

- Current: semillas 1243488294, 1, 3735928559 y 8675309; 10.000 valores × siete opciones por semilla = 280.000 round-trips, cero fallos.
- Next: semilla 6234150; 70.000 round-trips y 3.612 casos de profundidad, cero fallos.
- Números current: 99.937 patrones finitos binary64 comprobados, cero fallos.
- Números next: 100.000 valores exactos por Object.is y estabilidad canónica, cero fallos.
- Profundidad current: 3.612 round-trips en niveles 4, 8, 16 y 32, cero fallos.
- Fuzz aislado: 1.000 entradas por cada dialecto; cero excepciones inesperadas, alteraciones de prototipo o ejecución de contenido.
- Conformidad portable: ejecutada por las pruebas de fixtures dentro de npm test.
- git diff --check y node --check de los archivos JavaScript: pasaron.
- npm pack dry-run, creación real del tarball e instalación offline: pasaron.

## 7. Bloqueantes restantes

1. Resolver explícitamente si Node 22 debe ser el mínimo oficial. No fue posible verificarlo en este entorno y por ello no se añadió engines.
2. Si se decide que Node 22 es requisito de release, repetir npm test, smoke ESM y empaquetado con una versión 22 exacta antes de declarar >=22.0.0.
3. Si basta con los runtimes probados, documentar esa política y definir si se desea declarar un mínimo distinto. No inferir soporte universal a partir de versiones no probadas.
4. No se probó una segunda implementación del formato; los fixtures son portables, pero todavía no demuestran interoperabilidad entre lenguajes.

La documentación de ALE-5H queda como registro histórico de la auditoría anterior; este documento registra la resolución de licencia y los resultados de ALE-5I.
