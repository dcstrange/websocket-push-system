(function (win, doc) {
  function change() {
    window.echartRem = document.documentElement.clientWidth / 120;
    document.documentElement.style.fontSize = window.echartRem + "px";
    document.getElementsByTagName("body")[0].style.fontSize =
      window.echartRem + "px";
  }
  win.addEventListener("resize", change, false);
  win.addEventListener("DOMContentLoaded", change, false);
})(window, document);

window.sockectHost = "ws://localhost:3000";
