import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  ListTodo,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";

import "./app-preview.css";

import { initialPreviewTasks } from "../../../data/landing-preview";
import type { PreviewTask } from "../../../types/landing-preview";

type PreviewPanel = "note" | "files" | "tasks";
type PreviewDocument = "note" | "diagram";

/** A small, self-contained product preview for the landing page hero. */
export function AppPreview() {
  const [note, setNote] = useState("");
  const [tasks, setTasks] = useState<PreviewTask[]>(initialPreviewTasks);
  const [taskDraft, setTaskDraft] = useState("");
  const [isFolderOpen, setIsFolderOpen] = useState(true);
  const [document, setDocument] = useState<PreviewDocument>("note");
  const [activePanel, setActivePanel] = useState<PreviewPanel>("note");
  const [exitingTaskIds, setExitingTaskIds] = useState<Set<number>>(new Set());
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const nextTaskId = useRef(initialPreviewTasks.length + 1);
  const pendingRemovalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useLayoutEffect(() => {
    const textarea = noteRef.current;
    if (!textarea) return;

    textarea.focus({ preventScroll: true });
    const cursorPosition = textarea.value.length;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
  }, []);

  useEffect(() => {
    return () => {
      pendingRemovalTimers.current.forEach((timer) => clearTimeout(timer));
      pendingRemovalTimers.current.clear();
    };
  }, []);

  function selectDocument(nextDocument: PreviewDocument) {
    setDocument(nextDocument);
    setActivePanel("note");
  }

  function removeTask(taskId: number) {
    if (exitingTaskIds.has(taskId)) return;

    setExitingTaskIds((current) => new Set(current).add(taskId));
    const removalTimer = setTimeout(() => {
      pendingRemovalTimers.current.delete(removalTimer);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setExitingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }, 220);
    pendingRemovalTimers.current.add(removalTimer);
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = taskDraft.trim();
    if (!label) return;

    const task = { id: nextTaskId.current++, label };
    setTasks((current) => [...current, task]);
    setTaskDraft("");
  }

  return (
    <section className="app-preview" aria-label="Preview interativo do Excalisidian">
      <div className="app-preview__chrome">
        <div className="app-preview__topbar">
          <div className="app-preview__brand-lockup">
            <span className="app-preview__brand">Excalisidian</span>
          </div>
        </div>

        <div className="app-preview__document-tabs" role="group" aria-label="Documentos abertos">
          <button
            type="button"
            aria-pressed={document === "note"}
            className={document === "note" ? "is-active" : ""}
            onClick={() => selectDocument("note")}
          >
            <FileText size={14} aria-hidden="true" />
            Notas e tarefas
          </button>
          <button
            type="button"
            aria-pressed={document === "diagram"}
            className={document === "diagram" ? "is-active" : ""}
            onClick={() => selectDocument("diagram")}
          >
            <PenLine size={14} aria-hidden="true" />
            Mapa de ideias
          </button>
        </div>

        <div className="app-preview__mobile-tabs" role="group" aria-label="Áreas do preview">
          <button
            type="button"
            aria-pressed={activePanel === "note"}
            className={activePanel === "note" ? "is-active" : ""}
            onClick={() => setActivePanel("note")}
          >
            <FileText size={15} aria-hidden="true" />
            Nota
          </button>
          <button
            type="button"
            aria-pressed={activePanel === "files"}
            className={activePanel === "files" ? "is-active" : ""}
            onClick={() => setActivePanel("files")}
          >
            <Folder size={15} aria-hidden="true" />
            Pastas
          </button>
          <button
            type="button"
            aria-pressed={activePanel === "tasks"}
            className={activePanel === "tasks" ? "is-active" : ""}
            onClick={() => setActivePanel("tasks")}
          >
            <ListTodo size={15} aria-hidden="true" />
            Tarefas
          </button>
        </div>

        <div className="app-preview__workspace">
          <aside className={`app-preview__files-panel ${activePanel === "files" ? "is-mobile-active" : ""}`}>
            <div className="app-preview__panel-heading">
              <span className="app-preview__eyebrow">espaço de trabalho</span>
              <span className="app-preview__count">03 itens</span>
            </div>

            <div className="app-preview__file-tree">
              <button
                type="button"
                className="app-preview__tree-row app-preview__tree-folder"
                aria-expanded={isFolderOpen}
                onClick={() => setIsFolderOpen((open) => !open)}
              >
                {isFolderOpen ? <FolderOpen size={16} aria-hidden="true" /> : <Folder size={16} aria-hidden="true" />}
                <span>Meu espaço</span>
                <ChevronDown className={isFolderOpen ? "is-open" : ""} size={14} aria-hidden="true" />
              </button>

              {isFolderOpen && (
                <div className="app-preview__tree-children">
                  <button
                    type="button"
                    className={`app-preview__tree-row app-preview__tree-document ${document === "note" ? "is-selected" : ""}`}
                    aria-current={document === "note" ? "page" : undefined}
                    onClick={() => selectDocument("note")}
                  >
                    <FileText size={15} aria-hidden="true" />
                    <span>Notas e tarefas</span>
                  </button>
                  <button
                    type="button"
                    className={`app-preview__tree-row app-preview__tree-document ${document === "diagram" ? "is-selected" : ""}`}
                    aria-current={document === "diagram" ? "page" : undefined}
                    onClick={() => selectDocument("diagram")}
                  >
                    <PenLine size={15} aria-hidden="true" />
                    <span>Mapa de ideias</span>
                  </button>
                </div>
              )}
            </div>

          </aside>

          <div className={`app-preview__editor-panel ${activePanel === "note" ? "is-mobile-active" : ""}`}>
            {document === "note" ? (
              <div className="app-preview__note-editor">
                <div className="app-preview__note-meta">
                  <span>nota / início</span>
                  <span>agora</span>
                </div>
                <h1>Notas, Diagramas e Tarefas</h1>
                <p className="app-preview__note-lede">Só isso.</p>
                <p className="app-preview__note-ai">(Com IA, se você quiser)</p>
                <label className="app-preview__sr-only" htmlFor="preview-note">
                  Escreva na sua nota
                </label>
                <textarea
                  id="preview-note"
                  ref={noteRef}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Comece a escrever..."
                  spellCheck="true"
                />
              </div>
            ) : (
              <div className="app-preview__diagram-view" aria-label="Visualização do diagrama">
                <div className="app-preview__note-meta">
                  <span>diagrama</span>
                </div>
                <div className="app-preview__diagram-canvas">
                  <svg
                    className="app-preview__diagram-svg"
                    viewBox="0 0 640 300"
                    role="img"
                    aria-labelledby="preview-diagram-title preview-diagram-description"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <title id="preview-diagram-title">Relações entre ideias, notas e tarefas</title>
                    <desc id="preview-diagram-description">
                      Um diagrama que conecta ideias a notas e tarefas.
                    </desc>
                    <line className="app-preview__diagram-edge" x1="184" y1="73" x2="260" y2="141" />
                    <line className="app-preview__diagram-edge" x1="380" y1="170" x2="456" y2="229" />
                    <g className="app-preview__diagram-node">
                      <rect className="app-preview__diagram-node-shape" x="64" y="44" width="120" height="58" rx="3" />
                      <text className="app-preview__diagram-node-label" x="124" y="73">Ideias</text>
                    </g>
                    <g className="app-preview__diagram-node app-preview__diagram-node-main">
                      <rect className="app-preview__diagram-node-shape" x="260" y="112" width="120" height="58" rx="3" />
                      <text className="app-preview__diagram-node-label" x="320" y="141">Notas</text>
                    </g>
                    <g className="app-preview__diagram-node">
                      <rect className="app-preview__diagram-node-shape" x="456" y="200" width="120" height="58" rx="3" />
                      <text className="app-preview__diagram-node-label" x="516" y="229">Tarefas</text>
                    </g>
                  </svg>
                </div>
              </div>
            )}
          </div>

          <aside className={`app-preview__tasks-panel ${activePanel === "tasks" ? "is-mobile-active" : ""}`}>
            <div className="app-preview__panel-heading">
              <span className="app-preview__eyebrow">tarefas</span>
              <span className="app-preview__count">{tasks.length.toString().padStart(2, "0")}</span>
            </div>
            <div className="app-preview__tasks-list" aria-live="polite">
              {tasks.length === 0 ? (
                <p className="app-preview__empty-tasks">Tudo em ordem por aqui.</p>
              ) : (
                tasks.map((task) => (
                  <div className={`app-preview__task ${exitingTaskIds.has(task.id) ? "is-exiting" : ""}`} key={task.id}>
                    <button
                      type="button"
                      className="app-preview__task-check"
                      aria-label={`Concluir tarefa: ${task.label}`}
                      onClick={() => removeTask(task.id)}
                    >
                      <Check size={13} aria-hidden="true" />
                    </button>
                    <span>{task.label}</span>
                    <button
                      type="button"
                      className="app-preview__task-delete"
                      aria-label={`Apagar tarefa: ${task.label}`}
                      onClick={() => removeTask(task.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <form className="app-preview__task-form" onSubmit={addTask}>
              <input
                value={taskDraft}
                onChange={(event) => setTaskDraft(event.target.value)}
                placeholder="Nova tarefa"
                aria-label="Nome da nova tarefa"
              />
              <button type="submit" aria-label="Criar tarefa">
                <Plus size={17} aria-hidden="true" />
              </button>
            </form>
          </aside>
        </div>

      </div>
    </section>
  );
}

export default AppPreview;
