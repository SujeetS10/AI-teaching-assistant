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
});
