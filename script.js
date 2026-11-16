"use strict";
const clock = document.getElementById("nyc-clock");
const nycTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});
function showClock() {
  if (clock) {
    clock.textContent = nycTime.format(new Date()).replace(",", "").replace(" AM", "am").replace(" PM", "pm") + " NYC";
  }
}
showClock();
setInterval(showClock, 30000);
