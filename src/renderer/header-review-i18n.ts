const findings: Record<string, Record<string, string>> = {
  https: {
    "Response URL uses HTTPS; certificate validation and TLS configuration are not assessed here.":
      "Адрес ответа использует HTTPS. Сертификат и конфигурация TLS этой проверкой не оцениваются.",
    "Response URL uses plaintext HTTP; content may be observable in transit.":
      "Адрес ответа использует незашифрованный HTTP. Передаваемое содержимое может быть доступно наблюдателю сети.",
  },
  hsts: {
    "HSTS is not honored from an HTTP response.":
      "Браузер не применяет HSTS, полученный в ответе по HTTP.",
    "One HSTS header with positive max-age observed; preload, subdomains and effective browser state are not verified.":
      "Обнаружен один заголовок HSTS с положительным max-age. Предзагрузка HSTS, охват поддоменов и фактическое состояние браузера не проверены.",
    "No single HSTS header with a positive max-age was observed. Review transport requirements for this site.":
      "Не обнаружен единственный заголовок HSTS с положительным max-age. Проверьте требования сайта к защищённому соединению.",
  },
  csp: {
    "Enforcing CSP header observed; presence does not establish a safe or valid policy. Directive semantics, nonces and bypasses are not assessed.":
      "Обнаружен заголовок CSP в режиме применения ограничений. Его наличие не подтверждает корректность или безопасность политики. Семантика директив, nonce и способы обхода не проверены.",
    "Only report-only CSP observed; report-only policies do not enforce restrictions.":
      "Обнаружена только CSP в режиме отчётности. Такая политика не применяет ограничения.",
    "No enforcing CSP header observed. Meta policies and application context are not assessed.":
      "Заголовок CSP в режиме применения ограничений не обнаружен. Политики в meta и особенности приложения не оценены.",
  },
  nosniff: {
    "Expected one X-Content-Type-Options header with the nosniff token; resource MIME correctness is not assessed.":
      "Проверяется наличие одного заголовка X-Content-Type-Options со значением nosniff. Корректность MIME-типов ресурсов не оценивается.",
  },
  "referrer-policy": {
    "Checks the last recognized header policy against conservative choices. Missing headers may still receive browser defaults or document policies.":
      "Последнее распознанное значение заголовка сравнивается с консервативными вариантами политики. При отсутствии заголовка могут действовать стандартные настройки браузера или политика документа.",
  },
  "permissions-policy": {
    "Checks only basic directive-list shape. Supported feature names, origin allowlists and effective permissions are not validated.":
      "Проверяется только базовая форма списка директив. Поддерживаемые имена возможностей, списки разрешённых origin и фактически выданные разрешения не проверены.",
  },
};

export function headerFindingText(
  locale: "ru" | "en",
  rule: string,
  detail: string,
): string {
  return locale === "ru" ? findings[rule]?.[detail] || detail : detail;
}

export function headerLimitationText(
  locale: "ru" | "en",
  detail: string,
): string {
  return locale === "ru"
    ? "Пассивная эвристическая проверка только полученных заголовков ответа. Отсутствующие или подозрительные заголовки отмечаются как предупреждения для анализа, а не подтверждённые уязвимости. Активные запросы, эксплуатация, аудит сертификатов, сбор значений cookies и полная проверка CSP не выполняются."
    : detail;
}
