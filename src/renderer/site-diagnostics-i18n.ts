const messages = {
  ru: {
    title: "IP и сеть сайта",
    inspect: "Определить IP",
    lookup: "Узнать ASN и владельца сети",
    busy: "Проверка…",
    hint: "Явная DNS-проверка выбранного сайта через настройки Direct/Private профиля. Она может вернуть адрес CDN, а не исходного сервера.",
    disclosure:
      "Кнопка владельца сети отправляет публичный IP и затем ASN в RIPEstat (stat.ripe.net). Имя сайта и URL сервису не отправляются. Данные владельца сети могут отличаться от реального хостера сайта.",
    empty: "Сначала выберите открытую веб-страницу.",
    onion:
      "Onion-сервис скрывает IP сервера. Определение IP и хостера для него недоступно.",
    protected:
      "В Tor/Proxy локальная DNS-диагностика отключена, чтобы не раскрывать адрес через обычный DNS. Для сети используйте Chromium DevTools выбранной страницы.",
    failed: "Не удалось получить DNS-адреса. Проверьте соединение и имя сайта.",
    unavailable:
      "Поставщик не вернул сведения о сети. Возможны отсутствие маршрута, ограничение запросов или ошибка соединения.",
    privateAddress:
      "Локальные, специальные и зарезервированные IP не отправляются внешнему поставщику.",
    hostname: "Имя сайта",
    addresses: "DNS-адреса",
    prefix: "Анонсируемая сеть",
    asns: "Объявляющие ASN",
    holder: "Владелец ASN (RIPEstat)",
    provider: "Источник",
    unknown: "Нет данных",
    error:
      "Диагностика недоступна. Проверьте выбранную вкладку и Network Kill Switch.",
  },
  en: {
    title: "Site IP and network",
    inspect: "Resolve IP",
    lookup: "Look up ASN and network owner",
    busy: "Checking…",
    hint: "Explicit DNS lookup of the selected site using the Direct/Private profile settings. Results may identify a CDN rather than the origin server.",
    disclosure:
      "The network-owner button sends the public IP and then ASN to RIPEstat (stat.ripe.net). The hostname and page URL are not sent. Network ownership may differ from the site's actual hosting provider.",
    empty: "Select an open web page first.",
    onion:
      "Onion services hide their server IP. IP and hosting-provider discovery is unavailable for them.",
    protected:
      "Local DNS diagnostics are disabled in Tor/Proxy to avoid revealing destinations through ordinary DNS. Use the selected page's Chromium DevTools for network inspection.",
    failed: "DNS lookup failed. Check the connection and site hostname.",
    unavailable:
      "The provider returned no network information. Routing data, rate limits or connectivity may be responsible.",
    privateAddress:
      "Local, special-use and reserved IPs are never sent to the external provider.",
    hostname: "Hostname",
    addresses: "DNS addresses",
    prefix: "Announced prefix",
    asns: "Announcing ASNs",
    holder: "ASN holder (RIPEstat)",
    provider: "Source",
    unknown: "Unavailable",
    error:
      "Diagnostics unavailable. Check the selected tab and Network Kill Switch.",
  },
} as const;

export function diagnosticsText(
  locale: "ru" | "en",
  key: keyof typeof messages.en,
): string {
  return messages[locale][key];
}
