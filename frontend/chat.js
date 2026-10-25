"use strict";
// Browser-only conversation UI. Pi will own inference when the backend connects.
let activeChat = "",
  editingMessage = "",
  recorder = null,
  recordingStream = null,
  recordingTimer = null;
let attachmentURLs = [];
let addingFiles = false,
  requestingMicrophone = false;
const chatFiles = new Map();
const chatId = () =>
  "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
function normalizeChats(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (c) => c && /^c-[a-z0-9-]+$/.test(c.id) && Array.isArray(c.messages),
    )
    .slice(0, 100)
    .map((c) => ({
      id: c.id,
      title: String(c.title || "New chat").slice(0, 100),
      model: String(c.model || "Workspace default").slice(0, 100),
      draft: String(c.draft || "").slice(0, 2000),
      attachments: normalizeAttachments(c.attachments),
      messages: c.messages
        .filter(
          (m) => m && /^c-[a-z0-9-]+$/.test(m.id) && typeof m.text === "string",
        )
        .slice(-200)
        .map((m) => ({
          id: m.id,
          text: m.text.slice(0, 2000),
          model: String(m.model || "Workspace default").slice(0, 100),
          attachments: normalizeAttachments(m.attachments),
          edited: Boolean(m.edited),
        })),
    }));
}
function normalizeAttachments(value) {
  return Array.isArray(value)
    ? value
        .filter(
          (f) =>
            f &&
            /^c-[a-z0-9-]+$/.test(f.id) &&
            typeof f.name === "string" &&
            Number.isFinite(f.size) &&
            f.size >= 0 &&
            f.size <= 10 * 1024 * 1024,
        )
        .slice(0, 5)
        .map((f) => ({
          id: f.id,
          name: f.name.slice(0, 200),
          size: f.size,
          type: String(f.type || "").slice(0, 100),
        }))
    : [];
}
function currentChat() {
  return state.chats.find((c) => c.id === activeChat);
}
function chatDraft() {
  return currentChat() || state.chatDraft;
}
function chatSidebar() {
  return `<div class="chat-nav"><button class="btn secondary" data-chat-action="new">${icon("compose")} New chat</button><a href="#chats" class="chat-history-link">${icon("chat")} Chats <span>${state.chats.length}</span></a>${state.chats
    .slice(0, 3)
    .map(
      (c) =>
        `<a class="recent-chat ${c.id === activeChat ? "active" : ""}" href="#chat/${c.id}">${esc(c.title)}</a>`,
    )
    .join("")}</div>`;
}
function chatComposer() {
  const draft = chatDraft(),
    model = draft.model || "Workspace default";
  const models = [
    ...new Set(
      [
        "Workspace default",
        state.models.generation,
        ...state.chatModels,
        model,
      ].filter(Boolean),
    ),
  ];
  const text = activeChat ? draft.draft : state.draft;
  return `<form id="chat-form" class="composer chat-composer"><div class="composer-title">${mark()}<label for="task">What are we working on?</label><kbd>Ctrl ↵</kbd></div><textarea id="task" name="task" maxlength="2000" placeholder="Ask a question or describe what you want to build…">${esc(text || "")}</textarea><div class="chat-attachments" id="draft-attachments">${attachmentList(draft.attachments, true)}</div><details class="task-details"><summary>Define success <span>Optional run plan</span>${icon("down")}</summary><div class="task-details-fields"><label for="acceptance">Acceptance criteria</label><textarea id="acceptance" name="acceptanceCriteria" maxlength="1000">${esc(state.draftDetails.acceptanceCriteria)}</textarea><label for="verification">Planned verification command</label><input id="verification" name="verificationCommand" maxlength="300" value="${esc(state.draftDetails.verificationCommand)}"><p>Planning only. No commands are executed.</p></div></details><div class="chat-toolbar"><div class="chat-toolbar-left"><details class="attach-menu"><summary class="icon-btn" aria-label="Add files and more" title="Add files and more">${icon("plus")}</summary><div class="attach-popover"><button type="button" data-chat-action="files" aria-label="Add files">${icon("paperclip")} Add files</button><button type="button" data-chat-action="images" aria-label="Add images">${icon("image")} Add images</button><p>Up to 5 files · 10 MB each<br>Stored on this device; never uploaded.</p></div></details><label class="chat-model">${icon("models")}<select id="chat-model" aria-label="Chat model">${models.map((m) => `<option ${m === model ? "selected" : ""}>${esc(m)}</option>`).join("")}<option value="__manage">Configure local model…</option></select></label></div><div class="chat-toolbar-right"><span id="draft-label" class="draft-label">${storageOK ? "Saved locally" : "Session only"}</span><button type="button" class="icon-btn" data-chat-action="voice" aria-label="Record voice note" title="Record voice note">${icon("mic")}</button><button class="btn primary chat-send" type="submit" aria-label="Send message" title="Send message">${icon("send")}</button></div></div><input id="chat-file-input" type="file" multiple hidden><p id="task-error" class="error-text" role="alert"></p><p class="chat-hint" id="voice-status" role="status">Frontend preview · AI replies and transcription await your local backend.</p></form>`;
}
function attachmentList(files = [], removable = false) {
  return files
    .map(
      (f) =>
        `<div class="chat-file" data-file-id="${esc(f.id)}"><span class="file-preview"></span><span class="file-name">${icon(f.type.startsWith("audio/") ? "mic" : "paperclip")}<span>${esc(f.name)}<small>${Math.ceil(f.size / 1024)} KB</small></span></span><button type="button" class="icon-btn" data-chat-action="download-file" data-file="${esc(f.id)}" aria-label="Download ${esc(f.name)}">${icon("download")}</button>${removable ? `<button type="button" class="icon-btn" data-chat-action="remove-file" data-file="${esc(f.id)}" aria-label="Remove ${esc(f.name)}">${icon("x")}</button>` : ""}</div>`,
    )
    .join("");
}
function chatPage() {
  const c = currentChat();
  if (!c)
    return heading(
      "Chat not found",
      "Choose a saved conversation or start a new one.",
      '<button class="btn primary" data-chat-action="new">New chat</button>',
    );
  return `<div class="conversation">${heading(esc(c.title), "Your conversation, files and model choice stay on this device.", `<button class="btn secondary" data-chat-action="export">${icon("download")} Save chat</button>`)}<div class="chat-status">${icon("info")} Local backend not connected. Messages are saved; no AI response has been generated.</div><div class="chat-messages">${c.messages.map((m, i) => `<article class="chat-message"><header><strong>You</strong><span>${esc(m.model)}${m.edited ? " · Edited" : ""}</span></header>${editingMessage === m.id ? `<form id="edit-message-form" data-message="${m.id}"><label for="edit-message">Edit message</label><textarea id="edit-message" name="message" maxlength="2000">${esc(m.text)}</textarea><div class="message-actions"><button type="button" class="text-button" data-chat-action="cancel-edit">Cancel</button><button class="btn secondary" type="submit">Save edit</button></div></form>` : `<div class="message-text">${esc(m.text)}</div>`}<div class="chat-attachments">${attachmentList(m.attachments)}</div><div class="message-actions"><button class="text-button" data-chat-action="edit" data-message="${m.id}">${icon("compose")} Edit message</button><button class="text-button" data-chat-action="copy" data-message="${m.id}" aria-label="Copy message ${i + 1}">${icon("copy")} Copy message</button></div></article>`).join("")}</div>${chatComposer()}<div class="chat-next"><span>Ready to scope a task?</span><button class="text-button" data-chat-action="plan">Create run plan ${icon("arrow")}</button></div></div>`;
}
function chatHistoryPage() {
  return (
    heading(
      "Your chats",
      "Conversations saved in this browser. Nothing is sent to a server.",
      `<button class="btn primary" data-chat-action="new">${icon("compose")} New chat</button>`,
    ) +
    (state.chats.length
      ? `<div class="chat-history">${state.chats.map((c) => `<a href="#chat/${c.id}"><span>${icon("chat")}<strong>${esc(c.title)}</strong><small>${c.messages.length} messages · ${esc(c.model)}</small></span>${icon("chevron")}</a>`).join("")}</div>`
      : '<div class="empty">No conversations yet. Start a chat to save your next idea.</div>')
  );
}
async function fileStore(mode, id, blob) {
  if (!globalThis.indexedDB)
    throw new Error("Persistent file storage unavailable");
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open("splyce-chat-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "files",
        mode === "get" ? "readonly" : "readwrite",
      );
      const r =
        mode === "get"
          ? tx.objectStore("files").get(id)
          : tx.objectStore("files").put(blob, id);
      tx.oncomplete = () => resolve(r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
function allChatAttachments() {
  return [
    ...state.chatDraft.attachments,
    ...state.chats.flatMap((c) => [
      ...c.attachments,
      ...c.messages.flatMap((m) => m.attachments),
    ]),
  ];
}
async function addChatFiles(files) {
  if (addingFiles) {
    toast("Wait for the current files to finish attaching.");
    return;
  }
  addingFiles = true;
  const draft = chatDraft();
  for (const file of files) {
    if (draft.attachments.length >= 5 || file.size > 10 * 1024 * 1024) {
      toast("Choose up to 5 files, no larger than 10 MB each.");
      break;
    }
    const f = {
      id: chatId(),
      name: file.name || "voice-note.webm",
      size: file.size,
      type: file.type,
    };
    chatFiles.set(f.id, file);
    try {
      await fileStore("put", f.id, file);
    } catch {
      toast(
        "File available for this visit only: browser file storage is unavailable.",
      );
    }
    draft.attachments.push(f);
  }
  addingFiles = false;
  save();
  if (document.getElementById("draft-attachments"))
    document.getElementById("draft-attachments").innerHTML = attachmentList(
      chatDraft().attachments,
      true,
    );
  hydrateChatFiles();
}
async function getChatFile(id) {
  return chatFiles.get(id) || (await fileStore("get", id));
}
function hydrateChatFiles() {
  attachmentURLs.forEach((url) => URL.revokeObjectURL(url));
  attachmentURLs = [];
  document.querySelectorAll?.("[data-file-id]").forEach(async (node) => {
    const f = allChatAttachments().find((f) => f.id === node.dataset.fileId);
    if (!f) return;
    try {
      const blob = await getChatFile(f.id);
      if (!node.isConnected) return;
      if (!blob) {
        node.querySelector(".file-preview").textContent =
          "File unavailable on this device";
        return;
      }
      if (
        /^image\/(png|jpeg|webp|gif)$/.test(blob.type) ||
        /^audio\//.test(blob.type)
      ) {
        const url = URL.createObjectURL(blob);
        attachmentURLs.push(url);
        const media = document.createElement(
          blob.type.startsWith("audio/") ? "audio" : "img",
        );
        media.src = url;
        if (media.tagName === "AUDIO") {
          media.controls = true;
          media.preload = "metadata";
        } else media.alt = f.name;
        node.querySelector(".file-preview").replaceChildren(media);
      }
    } catch {
      if (node.isConnected)
        node.querySelector(".file-preview").textContent =
          "File unavailable; attach it again";
    }
  });
}
async function copyChatText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Message copied.");
  } catch {
    toast(
      "Clipboard unavailable. Select the message text and copy it manually.",
    );
  }
}
function stopChatRecording(discard = false) {
  if (recorder) {
    recorder.discard = discard;
    if (recorder.state !== "inactive") recorder.stop();
  }
  recordingStream?.getTracks().forEach((t) => t.stop());
  recordingStream = null;
  clearTimeout(recordingTimer);
}
async function recordChatVoice() {
  if (requestingMicrophone) return;
  if (recorder) {
    stopChatRecording();
    return;
  }
  if (chatDraft().attachments.length >= 5) {
    toast("Remove an attachment before recording a voice note.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    toast(
      "Voice recording is unavailable in this browser. You can attach an audio file instead.",
    );
    return;
  }
  const form = document.getElementById("chat-form");
  requestingMicrophone = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!form?.isConnected) {
      requestingMicrophone = false;
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    requestingMicrophone = false;
    recordingStream = stream;
    const recording = new MediaRecorder(stream),
      chunks = [];
    recorder = recording;
    recording.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recording.onstop = async () => {
      recorder = null;
      stream.getTracks().forEach((t) => t.stop());
      clearTimeout(recordingTimer);
      document
        .querySelector('[data-chat-action="voice"]')
        ?.setAttribute("aria-label", "Record voice note");
      if (!recording.discard && chunks.length) {
        const blob = new Blob(chunks, {
          type: recording.mimeType || chunks[0].type,
        });
        await addChatFiles([
          new File(
            [blob],
            "voice-note." + (blob.type.includes("mp4") ? "m4a" : "webm"),
            { type: blob.type },
          ),
        ]);
      }
      const status = document.getElementById("voice-status");
      if (status)
        status.textContent = recording.discard
          ? "Recording stopped without saving."
          : "Voice note saved locally. Transcription awaits your local backend.";
    };
    recording.onerror = () => {
      recording.discard = true;
      stopChatRecording(true);
      toast("Recording failed. Try attaching an audio file.");
    };
    recording.start();
    document
      .querySelector('[data-chat-action="voice"]')
      ?.setAttribute("aria-label", "Stop voice recording");
    document.getElementById("voice-status").textContent =
      "Recording locally… click the microphone to stop. Maximum 60 seconds.";
    recordingTimer = setTimeout(() => stopChatRecording(), 60000);
  } catch {
    requestingMicrophone = false;
    stopChatRecording(true);
    recorder = null;
    toast(
      "Microphone unavailable or permission denied. You can attach an audio file instead.",
    );
  }
}
function handleChatClick(e) {
  const el = e.target.closest("[data-chat-action]");
  if (!el?.dataset.chatAction) return false;
  const action = el.dataset.chatAction,
    c = currentChat();
  if (action === "new") {
    activeChat = "";
    editingMessage = "";
    navigate("overview");
    requestAnimationFrame(() => document.getElementById("task")?.focus());
  }
  if (action === "files" || action === "images") {
    const input = document.getElementById("chat-file-input");
    input.accept =
      action === "images" ? "image/png,image/jpeg,image/webp,image/gif" : "";
    input.click();
    el.closest("details").open = false;
  }
  if (action === "remove-file") {
    chatDraft().attachments = chatDraft().attachments.filter(
      (f) => f.id !== el.dataset.file,
    );
    save();
    document.getElementById("draft-attachments").innerHTML = attachmentList(
      chatDraft().attachments,
      true,
    );
    hydrateChatFiles();
  }
  if (action === "copy")
    copyChatText(
      c?.messages.find((m) => m.id === el.dataset.message)?.text ||
        c?.messages
          .find((m) => m.id === el.dataset.message)
          ?.attachments.map((f) => f.name)
          .join("\n") ||
        "",
    );
  if (action === "copy-run")
    copyChatText(state.runs.find((r) => r.id === state.selected)?.task || "");
  if (action === "edit") {
    editingMessage = el.dataset.message;
    render();
    document.getElementById("edit-message")?.focus();
  }
  if (action === "cancel-edit") {
    editingMessage = "";
    render();
  }
  if (action === "export" && c)
    download(
      {
        frontendOnly: true,
        ...c,
        attachmentNote:
          "File metadata only. Download each attachment separately.",
      },
      "splyce-chat.json",
    );
  if (action === "voice") recordChatVoice();
  if (action === "plan" && c) {
    const message = c.messages.find((m) => m.text.trim().length >= 8);
    if (!message)
      toast("Add a task of at least 8 characters to create a run plan.");
    else {
      state.draft = message.text;
      save();
      navigate("new");
    }
  }
  if (action === "download-file") {
    const f = allChatAttachments().find((f) => f.id === el.dataset.file);
    if (f)
      getChatFile(f.id)
        .then((blob) => {
          if (!blob) throw new Error();
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        })
        .catch(() =>
          toast("This file is unavailable. Attach it again on this device."),
        );
  }
  return true;
}
function handleChatSubmit(e) {
  if (e.target.id === "edit-message-form") {
    e.preventDefault();
    const m = currentChat()?.messages.find(
      (m) => m.id === e.target.dataset.message,
    );
    const text = String(new FormData(e.target).get("message") || "")
      .trim()
      .slice(0, 2000);
    if (!m || (!text && !m.attachments.length)) {
      toast("A message needs text or an attachment.");
      return true;
    }
    m.text = text;
    m.edited = true;
    editingMessage = "";
    saved("Message updated locally.");
    render();
    return true;
  }
  if (e.target.id !== "chat-form") return false;
  e.preventDefault();
  if (addingFiles || requestingMicrophone) {
    toast("Wait for files or microphone permission before sending.");
    return true;
  }
  if (recorder) {
    toast("Stop the voice recording before sending.");
    return true;
  }
  const text = String(new FormData(e.target).get("task") || "")
      .trim()
      .slice(0, 2000),
    draft = chatDraft();
  if (!text && !draft.attachments.length) {
    document.getElementById("task-error").textContent =
      "Write a message or attach a file first.";
    return true;
  }
  let c = currentChat();
  if (state.chats.length >= 100 && !c) {
    toast("Chat storage is full. Export your chats before starting another.");
    return true;
  }
  if (c?.messages.length >= 200) {
    toast("This chat has 200 messages. Start a new chat to continue.");
    return true;
  }
  if (!c) {
    c = {
      id: chatId(),
      title: text.slice(0, 80) || draft.attachments[0].name,
      model: draft.model,
      draft: "",
      attachments: [],
      messages: [],
    };
    state.chats.unshift(c);
  }
  c.messages.push({
    id: chatId(),
    text,
    model: draft.model,
    attachments: [...draft.attachments],
    edited: false,
  });
  c.draft = "";
  c.attachments = [];
  state.draft = "";
  state.chatDraft = { model: draft.model, attachments: [], draft: "" };
  activeChat = c.id;
  saved("Message saved locally. Backend not connected.");
  navigate("chat/" + c.id);
  return true;
}
function handleChatInput(e) {
  if (e.target.id !== "task" || !document.querySelector("#chat-form"))
    return false;
  chatDraft().draft = e.target.value;
  if (!activeChat) state.draft = e.target.value;
  document.getElementById("draft-label").textContent = save()
    ? "Saved locally"
    : "Session only";
  document.getElementById("task-error").textContent = "";
  return true;
}
function handleChatChange(e) {
  if (e.target.id === "chat-file-input") {
    addChatFiles([...e.target.files]);
    e.target.value = "";
    return true;
  }
  if (e.target.id === "chat-model") {
    if (e.target.value === "__manage") navigate("models");
    else {
      chatDraft().model = e.target.value;
      saved("Model label saved. No backend connected.");
    }
    return true;
  }
  return false;
}
