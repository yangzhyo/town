/**
 * HR 小智 — 数字员工聊天引擎
 */
(function () {
  "use strict";

  // ===== DOM Elements =====
  const chatArea = document.getElementById("chatArea");
  const messagesEl = document.getElementById("messages");
  const welcomeCard = document.getElementById("welcomeCard");
  const quickQuestionsEl = document.getElementById("quickQuestions");
  const userInput = document.getElementById("userInput");
  const sendBtn = document.getElementById("sendBtn");
  const clearBtn = document.getElementById("clearBtn");
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.querySelector(".sidebar");

  let conversationStarted = false;

  // ===== Init =====
  function init() {
    renderQuickQuestions();
    bindEvents();
    userInput.focus();
  }

  // ===== Render quick-question buttons =====
  function renderQuickQuestions() {
    QUICK_QUESTIONS.forEach(function (q) {
      const btn = document.createElement("button");
      btn.className = "quick-btn";
      btn.textContent = q;
      btn.addEventListener("click", function () {
        handleUserMessage(q);
      });
      quickQuestionsEl.appendChild(btn);
    });
  }

  // ===== Event bindings =====
  function bindEvents() {
    sendBtn.addEventListener("click", function () {
      var text = userInput.value.trim();
      if (text) handleUserMessage(text);
    });

    userInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        var text = userInput.value.trim();
        if (text) handleUserMessage(text);
      }
    });

    // Auto-resize textarea
    userInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    clearBtn.addEventListener("click", clearChat);

    // Mobile sidebar toggle
    menuBtn.addEventListener("click", toggleSidebar);
  }

  // ===== Handle a user message =====
  function handleUserMessage(text) {
    if (!conversationStarted) {
      conversationStarted = true;
      welcomeCard.style.display = "none";
    }

    userInput.value = "";
    userInput.style.height = "auto";

    appendMessage("user", text);
    showTyping();

    // Simulate a short delay for natural feel
    var delay = 400 + Math.random() * 600;
    setTimeout(function () {
      hideTyping();
      var result = searchKnowledge(text);
      appendBotMessage(result);
      scrollToBottom();
    }, delay);
  }

  // ===== Knowledge search engine =====
  function searchKnowledge(query) {
    var q = query.toLowerCase();

    var scored = HR_KNOWLEDGE.map(function (item) {
      var score = 0;

      // Keyword matching
      item.keywords.forEach(function (kw) {
        if (q.indexOf(kw) !== -1) {
          score += 10;
        }
      });

      // Check if query is similar to the standard question
      var question = item.question.toLowerCase();
      if (q.indexOf(question) !== -1 || question.indexOf(q) !== -1) {
        score += 20;
      }

      // Partial character matching for short queries
      var chars = q.split("");
      var matchedChars = 0;
      chars.forEach(function (c) {
        item.keywords.forEach(function (kw) {
          if (kw.indexOf(c) !== -1) matchedChars++;
        });
      });
      if (chars.length > 0) {
        score += (matchedChars / (chars.length * item.keywords.length)) * 3;
      }

      return { item: item, score: score };
    });

    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    if (scored[0].score >= 5) {
      return {
        found: true,
        category: scored[0].item.category,
        question: scored[0].item.question,
        answer: scored[0].item.answer,
        related: scored
          .slice(1, 4)
          .filter(function (s) {
            return s.score >= 3;
          })
          .map(function (s) {
            return s.item.question;
          }),
      };
    }

    return {
      found: false,
      category: null,
      question: null,
      answer: null,
      related: [],
    };
  }

  // ===== Append user message =====
  function appendMessage(role, text) {
    var div = document.createElement("div");
    div.className = "message " + role;

    var avatarEmoji = role === "user" ? "🧑‍💻" : "👩‍💼";
    var time = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    div.innerHTML =
      '<div class="msg-avatar">' +
      avatarEmoji +
      "</div>" +
      '<div class="msg-content">' +
      '<div class="msg-bubble">' +
      escapeHTML(text) +
      "</div>" +
      '<div class="msg-meta">' +
      time +
      "</div>" +
      "</div>";

    messagesEl.appendChild(div);
    scrollToBottom();
  }

  // ===== Append bot message with optional category badge and related questions =====
  function appendBotMessage(result) {
    var div = document.createElement("div");
    div.className = "message bot";

    var time = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    var bubbleContent = "";

    if (result.found) {
      bubbleContent +=
        '<span class="msg-category">' +
        escapeHTML(result.category) +
        "</span>\n";
      bubbleContent += escapeHTML(result.answer);

      if (result.related.length > 0) {
        bubbleContent += "\n\n———\n你可能还想了解：";
        result.related.forEach(function (rq) {
          bubbleContent +=
            '\n• <a class="related-link" href="#">' + escapeHTML(rq) + "</a>";
        });
      }
    } else {
      bubbleContent +=
        "抱歉，我暂时无法找到与您问题匹配的政策信息。\n\n您可以尝试：\n• 换个关键词描述您的问题\n• 咨询以下常见话题：考勤、请假、薪酬、福利、入离职、绩效等\n• 或直接联系人力资源部：hr@company.com";
    }

    div.innerHTML =
      '<div class="msg-avatar">👩‍💼</div>' +
      '<div class="msg-content">' +
      '<div class="msg-bubble">' +
      bubbleContent +
      "</div>" +
      '<div class="msg-meta">' +
      time +
      "</div>" +
      "</div>";

    // Bind related-question links
    var links = div.querySelectorAll(".related-link");
    links.forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        handleUserMessage(this.textContent);
      });
    });

    messagesEl.appendChild(div);
    scrollToBottom();
  }

  // ===== Typing indicator =====
  var typingEl = null;

  function showTyping() {
    typingEl = document.createElement("div");
    typingEl.className = "message bot";
    typingEl.innerHTML =
      '<div class="msg-avatar">👩‍💼</div>' +
      '<div class="msg-content">' +
      '<div class="msg-bubble">' +
      '<div class="typing-indicator"><span></span><span></span><span></span></div>' +
      "</div></div>";
    messagesEl.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl && typingEl.parentNode) {
      typingEl.parentNode.removeChild(typingEl);
      typingEl = null;
    }
  }

  // ===== Clear chat =====
  function clearChat() {
    messagesEl.innerHTML = "";
    conversationStarted = false;
    welcomeCard.style.display = "";
    userInput.focus();
  }

  // ===== Mobile sidebar =====
  var overlay = null;

  function toggleSidebar() {
    sidebar.classList.toggle("open");
    if (sidebar.classList.contains("open")) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay show";
      overlay.addEventListener("click", toggleSidebar);
      document.body.appendChild(overlay);
    } else if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  // ===== Helpers =====
  function scrollToBottom() {
    requestAnimationFrame(function () {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function escapeHTML(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ===== Boot =====
  document.addEventListener("DOMContentLoaded", init);
})();
