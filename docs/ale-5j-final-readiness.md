# ALE-5J — Validación de Node 22 y preparación final de release

Fecha: 2026-10-27. No se publicó, no se cambió la versión y no se crearon commits ni tags.

## Veredicto

# CONDITIONAL

La licencia y el tarball están listos técnicamente, la instalación ESM externa pasa y el nombre npm ya corresponde a un paquete público existente. Node 22 no está instalado ni disponible en los gestores/binarios locales; la red del entorno no resuelve registry.npmjs.org y no se ejecutó un instalador remoto. No se añadió engines ni se afirma compatibilidad comprobada con Node 22. Además, el árbol Git está sucio y la snapshot empaquetada no corresponde a un commit identificable. Antes de etiquetar/publicar se necesita una revisión limpia/versionada y confirmar permisos de publicación con la cuenta propietaria.

## 1. Node.js 22 y engines

Se buscaron binarios en rutas de Homebrew y comandos node22, y gestores locales mise, fnm, asdf, volta y nvm. No se encontró Node 22. La caché npm local tampoco mostró un paquete node@22 disponible. Una consulta pública de metadatos con npm view falló con ENOTFOUND para registry.npmjs.org. No se descargaron runtimes, no se ejecutó un script de instalación remoto y no se modificó la instalación principal.

Versiones exactas ejecutadas:

| Node | Suite npm test | Campañas adicionales | Estado |
|---|---:|---|---|
| 20.19.6 | 81/81 en ALE-5I | consumidor tarball ESM | Pasó en ALE-5I |
| 24.21.0 | 81/81 en ALE-5J | campañas completas y consumidor ESM | Pasó |
| 22.x | no disponible | no ejecutadas | Sin afirmación de compatibilidad |

No se añadió engines. package.json no declara actualmente engines. La instrucción requerida de añadir >=22.0.0 dependía de probar Node 22; como esa prueba no pudo hacerse, se conserva el metadata actual. README y CHANGELOG registran Node 22 como no verificado. Las versiones ensayadas son muestras concretas, no validación de todos los patch releases ni de todas las versiones >=22.

## 2. Paquete, licencia y API

LICENSE contiene el texto MIT estándar con Copyright (c) 2026 Alexa N C. El SHA-256 del archivo es cdf6240126cf5f23b05a0500d4d36c98a3169ddda0fce383a637745490c503aa. La copia empaquetada se comparó con la fuente mediante cmp.

El paquete conserva version 0.0.2, type module, main/exports a ale.js y solo las funciones públicas parseALE/stringifyALE. ESM es la interfaz garantizada. No se ofrece build CommonJS; que require() logre cargar ESM síncrono en ciertos Node no es garantía del paquete. No hay dependencias runtime.

Se revisaron README, CHANGELOG, CONTRIBUTING, LICENSE, docs/specification.md y conformance/. Se mantienen current como default, legacy para compatibilidad y next experimental.

## 3. Empaquetado e instalación aislada

Se ejecutaron npm pack --dry-run --json, npm pack e instalación offline del tarball en /private/tmp/ale-5h-consumer, fuera del checkout. La prueba importó desde el nombre @alexa.kitsune/ale y pasó con Node 24.21.0 y 20.19.6.

El smoke test comprobó:

- parseALE/stringifyALE con current, legacy y next sobre una estructura compatible.
- 1e3 como string en current/legacy y número en next.
- Strings exponent-like quoted en next.
- Opciones del serializador en current.
- Error con name ALEParseError.
- Claves propias __proto__, constructor y prototype.
- Que las exportaciones ESM son parseALE y stringifyALE.

El tarball final de esta fase incluyó diez archivos: CHANGELOG.md, LICENSE, README.md, ale.js, package.json, conformance/README.md, conformance/ale-conformance.json, docs/specification.md, docs/ale-5b1-results.md y docs/ale-5f-results.md. Total: 38.637 bytes comprimidos, 137.119 bytes desempaquetados. No contiene node_modules, tests/, benchmarks/, .git ni .DS_Store. El escaneo de patrones comunes de secretos y rutas locales no encontró coincidencias.

SHA-256 del tarball: f0a9fda00a74fc54c875946720eac19679d0323a948fb4598a7da7156c434885.

SHA-1/shasum npm: 09e97b93fca1ed356cedd9a79aeb9b2e695ca141.

SHA-256 del fixture portable: 99415c2f4970e04016f57fff027df6c841d8da765bde63dd1268dd59055903e5.

Estos hashes describen el tarball de auditoría de versión 0.0.2; cambiar cualquier contenido exige regenerarlo y revisarlo.

## 4. Identidad y permisos npm

La búsqueda pública del registro npm lista @alexa.kitsune/ale como paquete existente versión 0.0.2 bajo un perfil mostrado como alexa. El nombre no está libre para crear un paquete distinto; la publicación futura tendría que actualizar ese paquete existente. [Ficha pública npm](https://www.npmjs.com/package/@alexa.kitsune/ale).

La entrada pública prueba que el nombre y el scope aparecen en el registro y que existe un paquete público con ese nombre. No prueba que la propietaria de este checkout tenga actualmente permisos de publicación, ni permite distinguir si el scope se administra como usuario u organización. No se intentó iniciar sesión, consultar credenciales locales ni ejecutar comandos npm autenticados. El npm CLI no pudo consultar el registro por DNS bloqueado.

La propietaria debe comprobar desde su cuenta:

~~~sh
npm whoami
npm owner ls @alexa.kitsune/ale
npm access get status @alexa.kitsune/ale
~~~

Para la publicación inicial de un paquete scoped público, npm documenta --access public; para nuevas versiones de un paquete scoped ya existente, ese flag no es necesario. La ficha consultada ya es pública, pero antes del release debe confirmarse el estado de acceso actual desde la cuenta. Véanse [publicación de scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/) y [npm access](https://docs.npmjs.com/cli/access/). No se cambió acceso alguno.

## 5. Resultados de pruebas

En Node 24.21.0:

- npm test: 81 aprobadas, 0 fallidas, 0 pendientes.
- Current: cuatro semillas (1243488294, 1, 3735928559, 8675309), 10.000 valores × siete opciones = 280.000 round-trips, cero fallos.
- Next: semilla 6234150, 70.000 round-trips y 3.612 casos de profundidad, cero fallos.
- Current numérico: 99.937 patrones finitos binary64, cero fallos.
- Next numérico: 100.000 valores exactos por Object.is y estabilidad canónica, cero fallos.
- Profundidad current: 3.612 round-trips en profundidades 4, 8, 16 y 32, cero fallos.
- Robustez: 1.000 entradas fuzz por cada dialecto, cero excepciones inesperadas, mutaciones de prototipo o ejecución de contenido.
- Los fixtures portables se ejecutan en npm test.
- npm pack, instalación externa, smoke ESM y licencia incluida: pasaron.
- git diff --check y node --check: pasaron.

Node 20.19.6 pasó la suite 81/81 en ALE-5I y el smoke de instalación ESM del tarball; Node 24.21.0 pasó esas mismas comprobaciones en ALE-5J. No se afirma resultado alguno en Node 22.

## 6. Estado Git y reproducibilidad

HEAD actual es 848f0c28aac7303e4de597c4371f475f5d74f7b5, cuyo commit registrado es “Remove .DS_Store files”. El remoto origin apunta a https://github.com/AlexaKitsune/abstract-list-expression.git.

El working tree tiene modificaciones en .gitignore, README.md, ale.js y package.json, y archivos no rastreados en CHANGELOG.md, CONTRIBUTING.md, LICENSE, benchmarks/, conformance/, docs/, package-lock.json y tests/. Esos cambios se acumularon durante ALE-1–5I; no se descartaron. El tarball refleja esa working tree, no el commit HEAD. Por ello su contenido no puede reproducirse desde una revisión Git identificable hasta que la propietaria revise y confirme los archivos en un commit.

Propuesta, sin ejecutar:

1. Revisar los archivos de release y decidir qué benchmarks históricos conservar en Git.
2. Primer commit candidato: “feat: prepare ALE 0.1.0 release” con implementación, pruebas, documentación y licencia aprobadas.
3. Resolver Node mínimo y owner/access npm.
4. En un paso de release posterior, cambiar explícitamente package.json/lockfile y CHANGELOG a 0.1.0, repetir pruebas y pack desde el commit limpio.
5. Crear etiqueta anotada v0.1.0 únicamente apuntando al commit cuyo tarball validado se va a publicar.

No hay commit ni tag nuevos.

## 7. Riesgos restantes y checklist

- [ ] Decidir si Node 22 es requisito mínimo; obtener un binario oficial/versión exacta en un entorno autorizado y repetir suite, campañas seleccionadas y smoke externo antes de declarar engines.
- [ ] Si no se requiere Node 22, aprobar explícitamente la política de soporte sin engines o definir otro mínimo que sí pueda probarse.
- [ ] La propietaria confirma npm whoami, owner list y access status; verificar 2FA/token de publicación al momento del release.
- [ ] Revisar scope de usuario/organización y acceso público; usar --access public solo si la operación y el estado del paquete lo requieren. No hacerlo en una nueva versión si npm confirma que el acceso público existente se conserva.
- [ ] Revisar/confirmar todos los archivos de la working tree; producir una revisión Git limpia que identifique el contenido del tarball.
- [ ] Repetir pack, instalar tarball y guardar sus checksums a partir de esa revisión final.
- [ ] Confirmar que la segunda ejecución con otro runtime solo cubre las versiones ensayadas; no extender la afirmación a releases no probados.
- [ ] Mantener version 0.0.2, current default, legacy y next experimental hasta el release autorizado.

## Conclusión

No hay fallos de funcionalidad en las campañas ejecutadas y la distribución ESM con licencia está validada. La preparación no es READY porque Node 22 no se pudo verificar, los permisos npm no se comprobaron autenticadamente y el tarball procede de un árbol sin commit de release. La propietaria puede cerrar esos puntos sin cambiar la gramática ni API.
