// AI Teaching Assistant — frontend logic.
// Talks only to this app's own FastAPI backend (/api/ask). Never calls
// Groq directly, and never handles any API key.

const MAX_QUESTION_LENGTH = 2000;

const form = document.getElementById("ask-form");
const regInput = document.getElementById("reg-no");
const questionInput = document.getElementById("question");
const charCount = document.getElementById("char-count");
const regError = document.getElementById("reg-no-error");
const questionError = document.getElementById("question-error");
const requestError = document.getElementById("request-error");
const askBtn = document.getElementById("ask-btn");
const clearBtn = document.getElementById("clear-btn");
const loading = document.getElementById("loading");
const answerBody = document.getElementById("answer-body");
const historyBtn = document.getElementById("history-btn");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const historyNote = document.getElementById("history-note");
const historyClose = document.getElementById("history-close");

// Math is extracted from the raw text and rendered directly with KaTeX
// BEFORE Markdown ever sees it (see renderAnswer/extractMath below). This
// avoids two problems with running Markdown and math together: Markdown's
// GFM tables split on "|", which breaks LaTeX absolute-value/norm bars
// like $|x|_\infty$; and Markdown's backslash-escaping rules silently
// strip backslashes (\, and \! become , and !) inside anything it doesn't
// recognize as protected math. Pulling math out first sidesteps both.

// Live character count for the question textarea.
questionInput.addEventListener("input", () => {
  charCount.textContent = questionInput.value.length;
});

function showFieldError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearFieldErrors() {
  regError.hidden = true;
  questionError.hidden = true;
  requestError.hidden = true;
}

function validate(regNo, question) {
  let valid = true;

  if (!regNo) {
    showFieldError(regError, "Registration number is required.");
    valid = false;
  }

  if (!question) {
    showFieldError(questionError, "Please enter a question.");
    valid = false;
  } else if (question.length > MAX_QUESTION_LENGTH) {
    showFieldError(
      questionError,
      `Question is too long (max ${MAX_QUESTION_LENGTH} characters).`
    );
    valid = false;
  }

  return valid;
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  askBtn.disabled = isLoading;
  askBtn.textContent = isLoading ? "Thinking…" : "Ask question";
}

// Markdown + LaTeX rendering lives in /static/math-render.js (shared with
// the admin dashboard). It exposes window.renderRichText(text).
function renderAnswer(text) {
  answerBody.innerHTML = window.renderRichText(text);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldErrors();

  const regNo = regInput.value.trim();
  const question = questionInput.value.trim();

  if (!validate(regNo, question)) {
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        registration_no: regNo,
        question: question,
      }),
    });

    if (!response.ok) {
      let message = "Something went wrong. Please try again.";
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          message =
            typeof errorData.detail === "string"
              ? errorData.detail
              : "Please check your input and try again.";
        }
      } catch (_) {
        // Response body wasn't JSON — keep the default message.
      }
      showFieldError(requestError, message);
      return;
    }

    const data = await response.json();
    renderAnswer(data.answer);
    if (!historySection.hidden) {
      loadHistory({ silent: true });
    }
  } catch (err) {
    showFieldError(
      requestError,
      "Could not reach the server. Check your connection and try again."
    );
  } finally {
    setLoading(false);
  }
});

clearBtn.addEventListener("click", () => {
  form.reset();
  charCount.textContent = "0";
  clearFieldErrors();
  answerBody.innerHTML =
    '<p class="answer__placeholder">Your answer will appear here once you ask a question.</p>';
  hideHistory();
});


// ---------------------------------------------------------------------
// History: a student's own previous questions, looked up by the
// registration number currently typed in the form. The server filters by
// that number, so only that student's rows are ever returned.
// ---------------------------------------------------------------------

function hideHistory() {
  historySection.hidden = true;
  historyList.innerHTML = "";
  historyNote.textContent = "";
}

function formatTime(iso) {
  const date = new Date(iso);
  return isNaN(date) ? iso : date.toLocaleString();
}

function renderHistory(regNo, items) {
  historyList.innerHTML = "";

  historyNote.textContent = items.length
    ? `${items.length} previous question${items.length === 1 ? "" : "s"} for ${regNo} (newest first). Click a question to open its answer.`
    : `No previous questions found for ${regNo}.`;

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history__item";

    // Clickable header row: arrow + question + time
    const header = document.createElement("button");
    header.type = "button";
    header.className = "history__summary";
    header.setAttribute("aria-expanded", "false");

    const arrow = document.createElement("span");
    arrow.className = "history__arrow";
    arrow.textContent = "▸";

    const questionText = document.createElement("span");
    questionText.className = "history__question";
    questionText.textContent = item.question;   // textContent: never HTML

    const time = document.createElement("span");
    time.className = "history__time";
    time.textContent = formatTime(item.timestamp);

    header.appendChild(arrow);
    header.appendChild(questionText);
    header.appendChild(time);

    // Body: full question + rendered answer (hidden until clicked)
    const content = document.createElement("div");
    content.className = "history__content";
    content.hidden = true;

    const fullQuestion = document.createElement("p");
    fullQuestion.className = "history__full-question";
    fullQuestion.textContent = item.question;

    const answer = document.createElement("div");
    answer.className = "answer__body history__answer";

    content.appendChild(fullQuestion);
    content.appendChild(answer);
    card.appendChild(header);
    card.appendChild(content);

    let rendered = false;
    header.addEventListener("click", () => {
      const willOpen = content.hidden;   // currently closed -> opening

      if (willOpen && !rendered) {
        // Render the Markdown + math answer the first time it is opened.
        try {
          answer.innerHTML = window.renderRichText(item.response);
        } catch (err) {
          // If rendering ever fails, still show the answer as plain text.
          console.error("[history] could not render answer:", err);
          answer.textContent = item.response;
        }
        rendered = true;
      }

      content.hidden = !willOpen;
      header.setAttribute("aria-expanded", String(willOpen));
      arrow.textContent = willOpen ? "▾" : "▸";
      card.classList.toggle("is-open", willOpen);
    });

    historyList.appendChild(card);
  });

  historySection.hidden = false;
}

async function loadHistory({ silent = false } = {}) {
  clearFieldErrors();

  const regNo = regInput.value.trim();
  if (!regNo) {
    showFieldError(regError, "Enter your registration number to view your history.");
    return;
  }

  historyBtn.disabled = true;
  historyBtn.textContent = "Loading…";

  try {
    const response = await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registration_no: regNo }),
    });

    if (!response.ok) {
      if (!silent) {
        showFieldError(requestError, "Could not load your history. Please try again.");
      }
      return;
    }

    const items = await response.json();
    renderHistory(regNo, items);
    if (!silent) {
      historySection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (err) {
    if (!silent) {
      showFieldError(requestError, "Could not reach the server. Check your connection and try again.");
    }
  } finally {
    historyBtn.disabled = false;
    historyBtn.textContent = "History";
  }
}

historyBtn.addEventListener("click", () => loadHistory());
historyClose.addEventListener("click", hideHistory);
