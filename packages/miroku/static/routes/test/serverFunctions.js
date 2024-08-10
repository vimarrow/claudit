/**
 * A number, or a string containing a number.
 * @typedef {} NumberLike
 */

/**
* sets a param value based on request context
* @param {} request
*/
export async function ssrGetQueryParam(req) {
  return Math.round(Math.random() * 100);
}

export async function getDbValue(req) {
  await new Promise((res) => setTimeout(res), 3000);
  console.log('from serverFuntions:!');
}
