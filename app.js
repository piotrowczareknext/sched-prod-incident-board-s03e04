import { ack, fetchIncidents } from './api.js';
import { BUILD_SHA } from './config.js';

const loader = document.querySelector('[data-testid="loader"]');
const error = document.querySelector('[data-testid="error"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const incidents = new Map();
const acked = new Set();
const pendingAcks = new Set();

document.querySelector('meta[name="build"]').content = BUILD_SHA;
document.querySelector('[data-testid="build-sha"]').textContent = BUILD_SHA;

function isDayFirstLocale(locale) {
  return /^(?:en-(?:GB|AU|IE|NZ|ZA)|(?:bg|ca|cs|da|de|el|es|et|fi|fr|hr|hu|it|lt|lv|nl|no|pl|pt|ro|sk|sl|sv))/i.test(
    locale,
  );
}

function formatOpenedAt(value) {
  const date = new Date(value);
  const locale = navigator.language || 'en-US';
  const options = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const parts = Object.fromEntries(new Intl.DateTimeFormat(locale, options).formatToParts(date).map((part) => [part.type, part.value]));
  if (isDayFirstLocale(locale)) {
    return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function sortedIncidents() {
  return [...incidents.values()].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
  );
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function render() {
  const current = sortedIncidents();
  list.replaceChildren();

  for (const incident of current) {
    const row = document.createElement('li');
    row.dataset.testid = 'incident-row';
    row.dataset.id = incident.id;
    row.className = `row ${incident.severity}`;

    const id = document.createElement('span');
    id.className = 'id';
    id.textContent = incident.id;
    row.append(id);

    const severity = document.createElement('span');
    severity.className = 'sev';
    severity.textContent = incident.severity;
    row.append(severity);

    const summary = document.createElement('span');
    summary.className = 'what';
    summary.textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
    row.append(summary);

    const time = document.createElement('time');
    time.dateTime = incident.openedAt;
    time.textContent = formatOpenedAt(incident.openedAt);
    row.append(time);

    if (acked.has(incident.id)) {
      const marker = document.createElement('span');
      marker.dataset.testid = 'acked';
      marker.className = 'acked';
      marker.textContent = 'Acked';
      row.append(marker);
    } else {
      const button = document.createElement('button');
      button.dataset.testid = 'ack';
      button.type = 'button';
      button.textContent = pendingAcks.has(incident.id) ? 'Acking...' : 'Ack';
      button.disabled = pendingAcks.has(incident.id);
      button.addEventListener('click', () => acknowledge(incident.id));
      row.append(button);
    }

    list.append(row);
  }

  const hasIncidents = current.length > 0;
  empty.hidden = hasIncidents;
  list.hidden = !hasIncidents;
}

function merge(page) {
  for (const incident of page.incidents) {
    incidents.set(incident.id, { ...incidents.get(incident.id), ...incident });
  }
  render();
}

async function acknowledge(id) {
  if (pendingAcks.has(id) || acked.has(id)) return;
  pendingAcks.add(id);
  render();
  try {
    await ack(id);
    acked.add(id);
    error.hidden = true;
  } catch (cause) {
    console.error('Unable to acknowledge incident', id, cause);
    showError(`Unable to acknowledge ${id}. Try again.`);
  } finally {
    pendingAcks.delete(id);
    render();
  }
}

async function refresh() {
  try {
    merge(await fetchIncidents());
    loader.hidden = true;
    error.hidden = true;
  } catch (cause) {
    console.error('Unable to load incidents', cause);
    loader.hidden = true;
    showError('Unable to load incidents. Retrying...');
  }
}

await refresh();
const refreshTimer = setInterval(refresh, 2000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer), { once: true });
