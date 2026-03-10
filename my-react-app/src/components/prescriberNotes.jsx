import { FileText, Save, Pencil, Trash2, X } from "lucide-react";
import "../components/styles/prescriberNotes.css";

const PrescriberNotes = ({
  prescriberNotes, noteText, setNoteText, noteSaving, noteMsg,
  editingNoteId, editNoteText, setEditNoteText,
  handleSaveNote, handleSaveNoteEdit, handleDeleteNote,
  setEditingNoteId, formatDate,
}) => {
  return (
    <div className="pnote-card">
      <div className="pnote-header">
        <FileText size={14} color="#1a73e8" strokeWidth={2.5} />
        <span className="pnote-title">Prescriber Notes</span>
        <span className="pnote-count">{prescriberNotes.length} note{prescriberNotes.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="pnote-body">
        <div className="pnote-field">
          <label className="pnote-lbl">Add Clinical Note</label>
          <textarea className="pnote-ta" rows={3} placeholder="Type your clinical note here..." value={noteText} onChange={e => setNoteText(e.target.value)} />
        </div>

        <div className="pnote-save-row">
          {noteMsg === "success" && <span className="pnote-msg-success">Note saved</span>}
          {noteMsg === "error"   && <span className="pnote-msg-error">Failed to save</span>}
          <button className="pnote-save-btn" onClick={handleSaveNote} disabled={noteSaving || !noteText.trim()}>
            <Save size={13} style={{ marginRight: 5 }} />
            {noteSaving ? "Saving..." : "Save Note"}
          </button>
        </div>

        {prescriberNotes.length > 0 && <div className="pnote-divider" />}

        {prescriberNotes.length === 0 ? (
          <p className="pnote-empty">No notes yet. Add your first clinical note above.</p>
        ) : (
          prescriberNotes.map((n, i) => (
            <div key={n.ID || i} className="pnote-item">
              {editingNoteId === n.ID ? (
                <>
                  <textarea className="pnote-ta" rows={2} value={editNoteText} onChange={e => setEditNoteText(e.target.value)} style={{ marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="pnote-inline-save-btn" onClick={() => handleSaveNoteEdit(n.ID)}>
                      <Save size={12} style={{ marginRight: 4 }} />Save
                    </button>
                    <button className="pnote-inline-cancel-btn" onClick={() => { setEditingNoteId(null); setEditNoteText(""); }}>
                      <X size={12} style={{ marginRight: 4 }} />Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="pnote-text">{n.Notes}</div>
                  <div className="pnote-meta-row">
                    <span className="pnote-meta">{formatDate(n.Added_On)}</span>
                    <div className="pnote-actions">
                      <button className="pnote-action-btn" onClick={() => { setEditingNoteId(n.ID); setEditNoteText(n.Notes); }}>
                        <Pencil size={11} style={{ marginRight: 3 }} />Edit
                      </button>
                      <button className="pnote-action-btn pnote-action-btn-del" onClick={() => handleDeleteNote(n.ID)}>
                        <Trash2 size={11} style={{ marginRight: 3 }} />Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
              {i < prescriberNotes.length - 1 && <div className="pnote-divider" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PrescriberNotes;