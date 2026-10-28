# ALE-5E — Diseño de representación numérica científica

**Estado:** propuesta de diseño. No modifica parser, serializador, API, README, versión ni gramática.

## Modelo semántico observado

ALE tiene un tipo numérico: el JavaScript number binario64. La notación textual no crea un tipo distinto: 1000, 1e3 y 1E+3 deben equivaler al mismo número. El string "1e3" debe seguir siendo string cuando aparece quoted. El signo de cero sí importa: Object.is(-0, 0) es false.

El parser actual reconoce decimales con signo opcional y fracción decimal, pero no exponentes. Por eso value: 1e3 produce { value: "1e3" } en gramática current y legacy. El serializador expande exponentes derivados de String(number) mediante numberToALE para conservar el round-trip. A la vez, actualmente deja el string "1e3" sin comillas: es seguro únicamente porque el parser actual lo trata como string.

Si se aceptan exponentes numéricos bare, los strings coincidentes deberán ir entre comillas, incluidos "1e3", "1E+3", "-2.5e-8" y las variantes permitidas por la gramática léxica futura.

## Alternativas de compatibilidad

| Alternativa | Semántica | Ventajas | Riesgos y migración |
| --- | --- | --- | --- |
| A. Ampliar current y conservar legacy | Current lee exponentes bare como números; legacy mantiene la lectura anterior como string | Sintaxis concisa y ruta de compatibilidad disponible | Cambia el significado de documentos current existentes con exponentes bare. Los strings exponent-like deben quoted. Migrar leyendo casos ambiguos con legacy y volver a serializarlos con comillas |
| B. Dialecto optativo nuevo | Solo un dialecto/versionado adicional acepta exponentes | Current y legacy permanecen intactos; migración explícita | Hay que mantener una tercera gramática y definir cómo se declara en documento/API |
| C. Marcador numérico explícito | Exponentes bare siguen como strings; un prefijo declara el número | Evita reinterpretar documentos existentes | Cada valor marcado añade bytes/tokens; hay que aprobar un marcador y sus reglas de escape |

Formas esquemáticas como #1e3 o ~1e3 solo ilustran C; no son sintaxis ALE actual ni propuesta aprobada. Se debe revisar disponibilidad del prefijo antes de seleccionarlo.

A es la opción más simple si se acepta un cambio semántico en current y se prueba legacy. B ofrece migración más explícita con mayor costo de mantenimiento. C evita la colisión, pero requiere marcador nuevo y podría reducir el ahorro. La decisión requiere aprobación.

## Reversibilidad IEEE-754

Se generaron patrones crudos reproducibles de 64 bits con semilla 0x5e2026 hasta reunir 100,000 valores finitos. Se probaron la expansión decimal actual, String(number) y una notación científica normalizada: 300,000 conversiones exactas según Object.is, sin fallos. Se incluyeron +0, -0, Number.MIN_VALUE, mayor subnormal, menor normal y ambos extremos finitos. Esto es evidencia empírica, no una demostración formal sobre todo binario64.

Políticas recomendadas:

- El valor parseado es el number IEEE-754 de JavaScript, no decimal de precisión arbitraria.
- 1000, 1e3 y 1E+3 convergen al mismo valor; el serializador produce una representación canónica.
- Emitir -0 para el cero negativo.
- Rechazar overflow que produzca Infinity o -Infinity; NaN e infinitos quedan fuera del dominio.
- Aprobar una política para underflow. Se recomienda rechazar literales no nulos que redondeen a cero, como 1e-999, en vez de convertirlos silenciosamente en cero. Subnormales representables como 5e-324 siguen válidos.
- Enteros fuera de precisión exacta siguen la semántica de redondeo a number de JavaScript.

## Reglas canónicas propuestas

1. Aceptar mantisa decimal con e/E y exponente de signo opcional; rechazar mantisas o exponentes vacíos, separadores de millares y no finitos.
2. Convertir a number y rechazar overflow. Resolver underflow antes de implementar.
3. Citar strings que coincidan con la gramática numérica ampliada.
4. Mantener -0 explícito.
5. Emitir para los otros números la representación decimal corta de round-trip de ECMAScript, observable como String(number) en el runtime soportado. Usar exponente cuando ese algoritmo lo elija; no forzarlo para todos los valores.
6. No usar un tokenizador como regla canónica: ataría el texto a una familia y versión de modelo.

## Simulación de bytes y tokens

El simulador separado benchmarks/ale-5e/scientific-simulation.mjs reutiliza los 22 valores de ALE-5B.1: los 13 casos originales y 9 fixtures deterministas extendidos. Lee la salida actual con stringifyALE, conserva strings quoted y compara casos donde ALE y TOON conservaron equivalencia. Los documentos hipotéticos con exponente no son válidos bajo el parser actual. Resultados detallados, por caso y categoría: benchmarks/ale-5e/simulation-results.json.

| Representación | Bytes UTF-8 | Tokens o200k_base | Δ bytes vs ALE-5D | Δ tokens vs ALE-5D |
| --- | ---: | ---: | ---: | ---: |
| ALE-5D actual | 49,134 | 23,500 | — | — |
| Candidatos String(number) | 47,592 | 23,002 | −1,542 | −498 |
| Exponente forzado para todo número no cero | 55,234 | 32,018 | +6,100 | +8,518 |
| Elección local por bytes | 47,585 | 22,999 | −1,549 | −501 |
| Elección local por tokens | 47,587 | 22,997 | −1,547 | −503 |
| TOON actual | 49,164 | 22,844 | +30 bytes vs ALE-5D | −656 tokens vs ALE-5D |

Las elecciones locales miden cada número con 16 caracteres de contexto y luego cuentan el documento completo. Son una heurística reproducible, no un óptimo global ni una regla canónica. La tokenización BPE del documento completo no es aditiva.

### Resultados por categoría

- Caso original números: ALE-5D 743 B/262 tokens; String(number) 115/59; elección local 113/57. TOON: 115/59.
- Números ordinarios y extremos: 1,040/363 baja a 126/68 con String(number), 123/65 con elección local; TOON mide 128/71.
- Tablas de 10, 100 y 1,000 filas: String(number) no cambia los valores ordinarios del fixture. Forzar notación científica aumenta, respectivamente, 53 B/54 tokens, 651/752 y 6,671/7,845. En la tabla de 1,000 filas, elegir por tokens no mejora; elegir por bytes ahorra 2 bytes pero añade 2 tokens.
- Respuesta API extendida: String(number) no cambia el texto porque sus números son ordinarios. Exponente forzado aumenta 210 B/298 tokens.
- La notación científica forzada también empeora objetos pequeños, registros, configuración y eventos. Evitar exponentes cuando no acortan es necesario.

Los resultados hipotéticos no se presentan como salida ALE actual: hoy 1e-7 se parsea como string. La salida ALE actual y TOON sí conservaron equivalencia en los 22 casos.

## Migración

Si se aprueba A:

1. Mantener grammar: legacy para que 1e3 bare siga siendo string.
2. Actualizar current para aceptar exponentes y citar strings coincidentes.
3. Probar exponentes positivos/negativos, E/e, -0, subnormales, límites, overflow, underflow, strings quoted, arrays, tablas y slots.
4. Añadir diagnóstico de exponentes bare ambiguos; no reinterpretarlos automáticamente durante migraciones.
5. Canonicalizar el antiguo string bare 1e3 como "1e3", preservando su tipo y valor.

Para B, aprobar cómo se versiona y declara el dialecto antes de tocar API. Para C, aprobar el marcador y medir su costo de bytes/tokens, manteniendo exponentes bare como strings.

## Decisiones que requieren aprobación

1. ¿Cambiar current y conservar legacy (A), o crear dialecto optativo (B)?
2. Si no se acepta la colisión, ¿se autoriza diseñar un marcador explícito (C)?
3. ¿Rechazar underflow no nulo que redondea a cero?
4. ¿Aprobar ECMAScript shortest-round-trip como forma canónica, con -0 explícito?
5. ¿Qué runtime define la forma canónica dado que el paquete declara Node >=16?

## Plan de implementación posterior

1. Aprobar las decisiones y actualizar contrato/especificación primero.
2. Añadir pruebas de gramática, quoting, colisiones, overflow/underflow y legacy.
3. Implementar parser y serializador de forma acotada.
4. Repetir 100,000 patrones IEEE-754 con Object.is, incluyendo -0, además de generativas, profundidad, estabilidad y legacy.
5. Ejecutar ALE-5B.1 otra vez y reportar mediciones actuales por separado de simulaciones.

## Reproducción

- node benchmarks/ale-5e/scientific-simulation.mjs
- ALE_NUMERIC_CASES=100000 node benchmarks/ale-5c/numeric-roundtrip.mjs
- npm test
- git diff --check
