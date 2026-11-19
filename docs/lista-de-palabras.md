# Lista de palabras (es-v1)

`supabase/functions/_shared/wordlist-es-v1.ts` tiene 4.096 palabras en español. Cada palabra del código aporta 12 bits.

## Criterios

1. **De 4 a 10 letras**, solo letras del español. Se muestran en mayúsculas y con tilde.
2. **Comunes y fáciles de decir por teléfono.** Sustantivos, adjetivos y verbos en infinitivo de uso cotidiano. Incluye palabras de Chile (COPIHUE, PALTA, MARRAQUETA, PUDÚ).
3. **Ninguna suena igual a otra.** Se comparan como suenan en el español de Chile: b y v, s, z y c suave, ll e y, h muda, sin tildes. Por eso no están a la vez PAPA y PAPÁ, ni BARÓN y VARÓN.
4. **Sin pares casi iguales.** No hay dos palabras que solo difieran en la vocal final o el plural: de GATO y GATA queda una, de PUERTO y PUERTA queda una.
5. **Sin palabras ofensivas, alarmantes o propias de una estafa.** Se excluyeron groserías, enfermedades, muerte, violencia, armas, alcohol y tabaco, y también las que aparecen en una llamada fraudulenta: BANCO, DINERO, CLAVE, CÓDIGO, CUENTA, TARJETA, POLICÍA, HOSPITAL, URGENTE. También los números, que se confunden al dictar.
6. **Sin palabras de relleno** como OTRO, MISMO, HACER o TENER.

Los criterios 1, 3 y 4 los comprueba `tests/functions/wordlist.test.ts`. Los criterios 2, 5 y 6 dependen de una lectura humana.

## Fuentes

- 1.600 palabras vienen de la lista BIP39 en español (licencia MIT, tomada del paquete `@scure/bip39`), después de quitar 448 por los criterios de arriba.
- 2.496 palabras fueron escritas para este proyecto.
- La ortografía de todas se validó con el diccionario hunspell `dictionary-es`. El diccionario se usó solo para comprobar; ninguna palabra se tomó de él. Unas 80 palabras de uso chileno o préstamos comunes que el diccionario no trae se aceptaron a mano.

## Pendiente

La lista necesita la revisión de una persona hablante nativa antes de la publicación. Cualquier palabra que haya que sacar después de publicar obliga a crear una versión nueva.

## Cómo se cambia

La lista no se edita. Cambiar una palabra cambia el código de todas las familias al mismo tiempo. Un test fija el hash SHA-256 del contenido y falla ante cualquier edición.

Para una lista nueva: crear `wordlist-es-v2.ts`, subir `ALGORITHM_VERSION` en `daily-code.ts`, actualizar los vectores conocidos de los tests y avisar a las familias que el código cambiará en el despliegue.
