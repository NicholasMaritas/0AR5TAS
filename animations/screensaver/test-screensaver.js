// Testing adapter: preserves the collected Krink source.
class TestScreensaver extends Oa {
  reset() {
    clearTimeout(this.inactiveTimer);
    clearInterval(this.stampInterval);
    this.el.innerHTML = "";
    this.inactiveTimer = setTimeout(() => {
      this.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      this.el.classList.add("active");
      this.addImage();
      this.stampInterval = setInterval(() => this.addImage(), 20000);
    }, 10000);
  }
  deactivate() {
    if (this.el.classList.contains("active")) {
      document.body.style.overflow = this.previousOverflow || "";
    }
    this.el.classList.remove("active");
    this.reset();
  }
  fitImage(image) {
    const bounds = this.el.getBoundingClientRect();
    image.style.left = "0px";
    image.style.top = "0px";
    image.style.width = "";
    image.style.height = "";
    const initial = image.getBoundingClientRect();
    const scale = Math.min(1, bounds.width / initial.width, bounds.height / initial.height);
    if (scale < 1) image.style.width = image.offsetWidth * scale + "px";
    const rect = image.getBoundingClientRect();
    image.style.left = bounds.left - rect.left + Math.random() * Math.max(0, bounds.width - rect.width) + "px";
    image.style.top = bounds.top - rect.top + Math.random() * Math.max(0, bounds.height - rect.height) + "px";
  }
  addImage() {
    const image = new Image();
    image.style.transform = "rotate(" + this.getRandomInt(0, 360) + "deg)";
    const generation = this.inactiveTimer;
    image.onload = () => {
      if (this.el.classList.contains("active") && this.inactiveTimer === generation) {
        image.style.visibility = "hidden";
        this.el.appendChild(image);
        this.fitImage(image);
        image.style.visibility = "visible";
      }
    };
    image.src = this.images[Math.floor(Math.random() * this.images.length)];
  }
}
const screensaver = new TestScreensaver();
for (const event of ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
  window.addEventListener(event, () => screensaver.deactivate(), { passive: true });
}
window.addEventListener("resize", () => {
  for (const image of screensaver.el.querySelectorAll("img")) screensaver.fitImage(image);
});
