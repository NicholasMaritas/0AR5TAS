// Reconstructed using the rendered Supreme homepages at 1440x900 and 390x844 on 2026-11-16.
// Clock format and responsive logo destination are taken from observed rendered DOM.
(() => {
  const clock = document.querySelector('nav h2');
  const logoLink = document.querySelector('a[aria-label="Supreme Home"]');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  function update() {
    if (clock) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date())
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value]));
      clock.textContent = `${parts.month}/${parts.day}/${parts.year} ${parts.hour.padStart(2, '0')}:${parts.minute}${parts.dayPeriod.toLowerCase()} NYC`;
    }
    if (logoLink) {
      logoLink.href = window.matchMedia('(max-width: 767px)').matches
        ? 'https://us.supreme.com/pages/shop'
        : 'https://supreme.com/';
    }
  }
  update();
  window.setInterval(update, 30000);
  window.addEventListener('resize', update);
})();
