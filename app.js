(function () {
  var STATE_KEY = "witness-intake-state";

  var form = document.getElementById("intake");
  var done = document.getElementById("done");
  var doneHeading = document.getElementById("doneHeading");
  var formError = document.getElementById("formError");
  var submitBtn = document.getElementById("submitBtn");

  var statement = document.getElementById("statement");
  var statementText = document.getElementById("statementText");
  var statementError = document.getElementById("statementError");
  var recordBtn = document.getElementById("recordBtn");
  var recControls = document.getElementById("recControls");
  var playBtn = document.getElementById("playBtn");
  var deleteBtn = document.getElementById("deleteBtn");
  var skipBtn = document.getElementById("skipBtn");

  var contact = document.getElementById("contact");
  var contactError = document.getElementById("contactError");
  var contactBtn = document.getElementById("contactBtn");
  var contactDone = document.getElementById("contactDone");
  var fullNameEl = document.getElementById("fullName");
  var emailEl = document.getElementById("email");

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY)) || null;
    } catch (e) {
      return null;
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function render(state) {
    form.classList.add("hidden");
    done.classList.remove("hidden");

    if (state.contactDone) {
      doneHeading.classList.remove("hidden");
      statement.classList.add("hidden");
      contact.classList.add("hidden");
      contactDone.classList.remove("hidden");
    } else if (!state.statementDone) {
      statement.classList.remove("hidden");
      contact.classList.add("hidden");
    } else {
      doneHeading.classList.remove("hidden");
      statement.classList.add("hidden");
      contact.classList.remove("hidden");
    }
  }

  var existing = loadState();
  if (existing && existing.submitted) {
    render(existing);
    return;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    formError.textContent = "";

    var selections = [].slice
      .call(form.querySelectorAll('input[name="opt"]:checked'))
      .map(function (el) { return el.value; });

    if (selections.length < 2) {
      formError.textContent = "Please select at least two options.";
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections: selections }),
    })
      .then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      })
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.data && res.data.error) || "Submission failed");
        }
        var state = {
          submitted: true,
          token: res.data.token,
          willingToTestify: !!res.data.willingToTestify,
          statementDone: false,
          contactDone: false,
        };
        saveState(state);
        render(state);
      })
      .catch(function (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit";
        formError.textContent = err.message || "Something went wrong. Please try again.";
      });
  });

  function advanceToContact(state) {
    state.statementDone = true;
    saveState(state);
    doneHeading.classList.remove("hidden");
    statement.classList.add("hidden");
    contact.classList.remove("hidden");
  }

  function saveTranscript(token, text) {
    return fetch("/api/transcription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, text: text }),
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    });
  }

  function autoSaveTranscript() {
    var st = loadState();
    if (!st || !st.token) return;
    saveTranscript(st.token, statementText.value.trim()).catch(function () {});
  }

  var mediaRecorder = null;
  var audioChunks = [];
  var audioURL = null;
  var audioEl = null;
  var holding = false;

  function startRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      statementError.textContent = "Recording isn't supported in this browser.";
      return;
    }
    statementError.textContent = "";
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.addEventListener("dataavailable", function (e) {
          if (e.data && e.data.size > 0) audioChunks.push(e.data);
        });
        mediaRecorder.addEventListener("stop", function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          recordBtn.classList.remove("recording");
          var blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
          if (audioURL) URL.revokeObjectURL(audioURL);
          audioURL = URL.createObjectURL(blob);
          sendAudio(blob);
        });
        mediaRecorder.start();
        recordBtn.innerHTML =
          'Recording<span class="rec-dots"><span>.</span><span>.</span><span>.</span></span>';
        recordBtn.classList.add("recording");
        if (!holding) stopRecording();
      })
      .catch(function () {
        statementError.textContent = "Microphone access was denied.";
      });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  recordBtn.addEventListener("pointerdown", function (e) {
    if (recordBtn.dataset.mode === "submit") return;
    e.preventDefault();
    holding = true;
    recControls.classList.add("hidden");
    startRecording();
  });
  function release(e) {
    if (recordBtn.dataset.mode === "submit") return;
    if (e) e.preventDefault();
    holding = false;
    stopRecording();
  }
  recordBtn.addEventListener("pointerup", release);
  recordBtn.addEventListener("pointerleave", release);
  recordBtn.addEventListener("pointercancel", release);

  statementText.addEventListener("input", function () {
    var hasText = !!statementText.value.trim();
    recordBtn.textContent = hasText ? "Submit" : "Press to record";
    recordBtn.dataset.mode = hasText ? "submit" : "record";
  });

  recordBtn.addEventListener("click", function () {
    if (recordBtn.dataset.mode !== "submit") return;
    var state = loadState();
    if (!state || !state.token) {
      statementError.textContent = "Your session expired. Please reload.";
      return;
    }
    recordBtn.disabled = true;
    recordBtn.textContent = "Submitting…";
    saveTranscript(state.token, statementText.value.trim())
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.data && res.data.error) || "Could not save your message");
        }
        advanceToContact(state);
      })
      .catch(function (err) {
        recordBtn.disabled = false;
        recordBtn.textContent = "Submit";
        statementError.textContent = err.message || "Something went wrong. Please try again.";
      });
  });

  function sendAudio(blob) {
    recordBtn.classList.add("hidden");
    statementText.placeholder = "Transcribing…";
    var st = loadState();
    fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": blob.type || "audio/webm",
        "x-witness-token": (st && st.token) || "",
      },
      body: blob,
    })
      .then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      })
      .then(function (res) {
        statementText.placeholder = "Write what you know…";
        if (!res.ok) {
          throw new Error((res.data && res.data.error) || "Could not transcribe audio");
        }
        var t = (res.data && res.data.text) || "";
        if (t) {
          statementText.value = statementText.value
            ? statementText.value.trim() + " " + t
            : t;
          autoSaveTranscript();
        }
        recControls.classList.remove("hidden");
        recordBtn.textContent = "Submit";
        recordBtn.dataset.mode = "submit";
        recordBtn.classList.remove("hidden");
      })
      .catch(function (err) {
        statementText.placeholder = "Write what you know…";
        statementError.textContent = err.message || "Could not transcribe audio.";
        recordBtn.textContent = "Press to record";
        recordBtn.dataset.mode = "record";
        recordBtn.classList.remove("hidden");
      });
  }

  playBtn.addEventListener("click", function () {
    if (!audioURL) return;
    if (!audioEl) audioEl = new Audio();
    audioEl.src = audioURL;
    audioEl.play();
  });

  deleteBtn.addEventListener("click", function () {
    if (audioEl) audioEl.pause();
    if (audioURL) { URL.revokeObjectURL(audioURL); audioURL = null; }
    audioChunks = [];
    statementText.value = "";
    recControls.classList.add("hidden");
    recordBtn.textContent = "Press to record";
    recordBtn.dataset.mode = "record";
    statementError.textContent = "";
    autoSaveTranscript();
  });

  skipBtn.addEventListener("click", function () {
    var state = loadState();
    if (!state || !state.token) {
      statementError.textContent = "Your session expired. Please reload.";
      return;
    }
    saveTranscript(state.token, statementText.value.trim())
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.data && res.data.error) || "Could not save your message");
        }
        advanceToContact(state);
      })
      .catch(function (err) {
        statementError.textContent = err.message || "Something went wrong. Please try again.";
      });
  });

  contact.addEventListener("submit", function (e) {
    e.preventDefault();
    contactError.textContent = "";

    var state = loadState();
    if (!state || !state.token) {
      contactError.textContent = "Your session expired. Please reload.";
      return;
    }

    var fullName = fullNameEl.value.trim();
    var email = emailEl.value.trim();
    if (!fullName) {
      contactError.textContent = "Please enter your full name.";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      contactError.textContent = "Please enter a valid email.";
      return;
    }

    contactBtn.disabled = true;
    contactBtn.textContent = "Sending…";

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: state.token, fullName: fullName, email: email }),
    })
      .then(function (r) {
        return r.json().then(function (data) { return { ok: r.ok, data: data }; });
      })
      .then(function (res) {
        if (!res.ok) {
          throw new Error((res.data && res.data.error) || "Could not save details");
        }
        state.contactDone = true;
        saveState(state);
        contact.classList.add("hidden");
        doneHeading.classList.remove("hidden");
        contactDone.classList.remove("hidden");
      })
      .catch(function (err) {
        contactBtn.disabled = false;
        contactBtn.textContent = "Send";
        contactError.textContent = err.message || "Something went wrong. Please try again.";
      });
  });
})();
