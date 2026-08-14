const telegram = window.Telegram?.WebApp;
telegram?.ready();
telegram?.expand();

const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
let balance = 1000;
let selected = null;
let isSpinning = false;

const balanceElement = document.querySelector('#balance');
const modalBalanceElement = document.querySelector('#modalBalance');
const modal = document.querySelector('#rouletteModal');
const result = document.querySelector('#rouletteResult');
const wheel = document.querySelector('#rouletteWheel');
const wheelTrack = document.querySelector('#wheelTrack');
const rouletteBall = document.querySelector('#rouletteBall');
const spinButton = document.querySelector('#spinButton');
const betInput = document.querySelector('#betInput');
const selectedBet = document.querySelector('#selectedBet');
const numberGrid = document.querySelector('#numberGrid');
const europeanOrder = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
let wheelRotation = 0;
let ballAnimationFrame = null;

function renderBalance() {
  const formatted = balance.toLocaleString('ru-RU');
  balanceElement.textContent = formatted;
  modalBalanceElement.textContent = formatted;
}

function wheelMetrics() {
  const styles = getComputedStyle(wheel);
  return {
    outerRadius: parseFloat(styles.getPropertyValue('--ball-track-radius')),
    innerRadius: parseFloat(styles.getPropertyValue('--pocket-radius')),
  };
}

function setBallTransform(angleDeg, radiusPx) {
  rouletteBall.style.transform = `rotate(${angleDeg}deg) translateY(${-radiusPx}px)`;
}

function easeOutQuint(t) { return 1 - (1 - t) ** 5; }
function easeInOutCubic(t) { return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; }

// Ball always starts a fresh spin from the outer track and spirals inward as it slows,
// landing exactly on the winning pocket (which the wheel rotation aligns to the top/0deg mark).
function animateBallTo(duration = 4700) {
  const { outerRadius, innerRadius } = wheelMetrics();
  const laps = 7;
  const endAngle = -(laps * 360);
  const settleFrom = 0.58; // fraction of the spin where the ball starts dropping toward the numbers
  if (ballAnimationFrame) cancelAnimationFrame(ballAnimationFrame);
  rouletteBall.classList.add('dropping');
  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const angle = endAngle * easeOutQuint(t);
      let radius = outerRadius;
      if (t > settleFrom) {
        const rt = (t - settleFrom) / (1 - settleFrom);
        radius = outerRadius + (innerRadius - outerRadius) * easeInOutCubic(rt);
      }
      setBallTransform(angle, radius);
      if (t < 1) {
        ballAnimationFrame = requestAnimationFrame(frame);
      } else {
        ballAnimationFrame = null;
        rouletteBall.classList.remove('dropping');
        resolve();
      }
    }
    ballAnimationFrame = requestAnimationFrame(frame);
  });
}
function currentBet() { return Number(betInput.value); }

function validateBet(showMessage = false) {
  const raw = betInput.value.trim();
  const valid = /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 && Number(raw) <= balance;
  betInput.setAttribute('aria-invalid', String(!valid));
  spinButton.disabled = !valid || !selected || isSpinning;
  if (!valid && showMessage) result.textContent = raw === '' || !/^\d+$/.test(raw) || Number(raw) <= 0 ? 'Введите целое положительное число фишек.' : 'Ставка не может быть больше игрового баланса.';
  return valid;
}

function betLabel(type, value) {
  const labels = { low: '1–18', high: '19–36', even: 'Чётное', odd: 'Нечётное', color: value === 'red' ? 'Красное' : 'Чёрное', dozen: `${(value - 1) * 12 + 1}–${value * 12}`, column: `${value}-я колонка`, number: `число ${value}` };
  return labels[type];
}

function numbersForBet(type, value) {
  const numbers = [];
  for (let number = 0; number <= 36; number += 1) {
    if (type === 'number') { if (number === Number(value)) numbers.push(number); continue; }
    if (number === 0) continue;
    if (type === 'color' && (value === 'red') === redNumbers.has(number)) numbers.push(number);
    else if (type === 'even' && number % 2 === 0) numbers.push(number);
    else if (type === 'odd' && number % 2 === 1) numbers.push(number);
    else if (type === 'low' && number <= 18) numbers.push(number);
    else if (type === 'high' && number >= 19) numbers.push(number);
    else if (type === 'dozen' && Math.floor((number - 1) / 12) + 1 === Number(value)) numbers.push(number);
    else if (type === 'column' && ((number - 1) % 3) + 1 === Number(value)) numbers.push(number);
  }
  return numbers;
}

function highlightSelection() {
  document.querySelectorAll('.wheel-pocket.covered').forEach((item) => item.classList.remove('covered'));
  if (!selected) return;
  const numbers = numbersForBet(selected.type, selected.value);
  numbers.forEach((number) => {
    const pocket = wheelTrack.querySelector(`.wheel-pocket[data-number="${number}"]`);
    if (pocket) pocket.classList.add('covered');
  });
}

function selectField(button) {
  selected = { type: button.dataset.type, value: button.dataset.value };
  document.querySelectorAll('.roulette-table button').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  highlightSelection();
  selectedBet.textContent = betLabel(selected.type, selected.value);
  result.textContent = 'Ставка готова. Крутите колесо!';
  validateBet();
}

function payoutFor(number) {
  if (selected.type === 'number') return number === Number(selected.value) ? 36 : 0;
  if (number === 0) return 0;
  if (selected.type === 'color') return (selected.value === 'red') === redNumbers.has(number) ? 2 : 0;
  if (selected.type === 'even') return number % 2 === 0 ? 2 : 0;
  if (selected.type === 'odd') return number % 2 === 1 ? 2 : 0;
  if (selected.type === 'low') return number <= 18 ? 2 : 0;
  if (selected.type === 'high') return number >= 19 ? 2 : 0;
  if (selected.type === 'dozen') return Math.floor((number - 1) / 12) + 1 === Number(selected.value) ? 3 : 0;
  if (selected.type === 'column') return ((number - 1) % 3) + 1 === Number(selected.value) ? 3 : 0;
  return 0;
}

function buildWheel() {
  europeanOrder.forEach((number, index) => {
    const pocket = document.createElement('span');
    const color = number === 0 ? 'green' : redNumbers.has(number) ? 'red' : 'black';
    pocket.className = `wheel-pocket ${color}`;
    pocket.dataset.number = number;
    pocket.style.setProperty('--angle', `${index * (360 / europeanOrder.length)}deg`);
    pocket.textContent = number;
    wheelTrack.append(pocket);
  });
}

function animateWheelTo(number) {
  const pocketIndex = europeanOrder.indexOf(number);
  const sector = 360 / europeanOrder.length;
  const landingAngle = -(pocketIndex * sector);
  const startWheel = wheelRotation;
  const finalWheel = startWheel + 3240 + landingAngle - (startWheel % 360);
  wheel.classList.add('spinning');
  wheelRotation = finalWheel;
  wheelTrack.style.transform = `rotate(${wheelRotation}deg)`;
  animateBallTo();
}

function spin() {
  if (!selected || !validateBet(true) || isSpinning) return;
  const bet = currentBet();
  isSpinning = true;
  balance -= bet;
  renderBalance();
  spinButton.disabled = true;
  result.textContent = 'Колесо крутится…';
  const number = Math.floor(Math.random() * 37);
  animateWheelTo(number);
  window.setTimeout(() => {
    const multiplier = payoutFor(number);
    const color = number === 0 ? 'зелёное' : redNumbers.has(number) ? 'красное' : 'чёрное';
    if (multiplier) { const prize = bet * multiplier; balance += prize; result.textContent = `Выпало ${number} (${color}). Вы выиграли ${prize} фишек!`; }
    else result.textContent = `Выпало ${number} (${color}). Эта ставка не сыграла.`;
    renderBalance();
    isSpinning = false;
    wheel.classList.remove('spinning');
    validateBet();
  }, 5000);
}

for (let row = 3; row >= 1; row -= 1) {
  for (let number = row; number <= 36; number += 3) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.type = 'number'; button.dataset.value = number;
    button.className = `number ${redNumbers.has(number) ? 'red' : 'black'}`; button.textContent = number;
    numberGrid.append(button);
  }
}

buildWheel();
setBallTransform(0, wheelMetrics().outerRadius);

document.querySelector('#openRoulette').addEventListener('click', () => { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); });
document.querySelector('#closeRoulette').addEventListener('click', () => { if (!isSpinning) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); } });
document.querySelector('#addCoins').addEventListener('click', () => { balance += 500; renderBalance(); validateBet(); });
document.querySelector('#maxBet').addEventListener('click', () => { betInput.value = balance; validateBet(); });
betInput.addEventListener('input', () => validateBet());
betInput.addEventListener('blur', () => validateBet(true));
document.querySelectorAll('.roulette-table').forEach((table) => table.addEventListener('click', (event) => { const button = event.target.closest('button[data-type]'); if (button && !isSpinning) selectField(button); }));
spinButton.addEventListener('click', spin);
modal.addEventListener('click', (event) => { if (event.target === modal && !isSpinning) modal.classList.remove('open'); });
renderBalance();
