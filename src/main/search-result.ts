/** Fixed read-only isolated-world probe. Never parse arbitrary engine text,
 * CAPTCHA, HTTP errors or a network timeout as an empty result set. */
export const emptySearchProbe = `(() => {
  const notice = document.querySelector('.no-results__message, [data-testid="no-results"]');
  if (!notice || !notice.textContent?.trim() || !notice.getClientRects().length) return false;
  const organic = document.querySelector('.result:not(.result--ad) .result__a, [data-testid="result"][data-layout="organic"] a[href], [data-testid="web-result"] a[href]');
  return !organic;
})()`;
