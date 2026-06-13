import React, { useState, useEffect } from 'react';
import { uploadCSV, confirmImport, getImportReports } from '../services/api';

/**
 * Dedicated CSV Import Page component that handles dragging, analyzing anomalies, reviewing fixes, and importing data.
 */
export default function ImportCSV({ groupId, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState(null);
  const [approvedIndices, setApprovedIndices] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [successSummary, setSuccessSummary] = useState(null);

  // Load past reports on mount
  const fetchHistory = async () => {
    try {
      const data = await getImportReports(groupId);
      setImportHistory(data.reports || []);
    } catch (err) {
      console.error('Failed to load past import reports', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [groupId]);

  // Drag and drop event handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setReport(null);
    setSuccessSummary(null);

    try {
      const data = await uploadCSV(groupId, file);
      setReport(data);

      // Pre-select clean rows & warning rows
      const initialApproved = data.rows
        .filter(r => r.status === 'ok' || r.status === 'warning')
        .map(r => r.rowIndex);
      setApprovedIndices(initialApproved);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to analyze CSV file.');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (approvedIndices.length === 0) {
      alert('Please select at least one row to import.');
      return;
    }

    try {
      const summary = await confirmImport(groupId, {
        fileName: file.name,
        rows: report.rows,
        approvedIndices
      });
      setSuccessSummary(summary);
      setReport(null);
      setFile(null);
      fetchHistory();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      alert('Failed to confirm and import CSV data.');
    }
  };

  // Bulk selectors
  const selectAllClean = () => {
    const cleanIndices = report.rows
      .filter(r => r.anomalies.length === 0)
      .map(r => r.rowIndex);
    // Merge with currently selected
    setApprovedIndices(Array.from(new Set([...approvedIndices, ...cleanIndices])));
  };

  const deselectAllErrors = () => {
    const errorIndices = report.rows
      .filter(r => r.status === 'error' || r.anomalies.some(a => a.severity === 'error'))
      .map(r => r.rowIndex);
    setApprovedIndices(approvedIndices.filter(idx => !errorIndices.includes(idx)));
  };

  const toggleRowSelect = (idx) => {
    if (approvedIndices.includes(idx)) {
      setApprovedIndices(approvedIndices.filter(i => i !== idx));
    } else {
      setApprovedIndices([...approvedIndices, idx]);
    }
  };

  const toggleRowExpand = (idx) => {
    setExpandedRow(expandedRow === idx ? null : idx);
  };

  // Helper metrics
  const getMetrics = () => {
    if (!report) return { total: 0, clean: 0, warnings: 0, errors: 0 };
    let clean = 0, warnings = 0, errors = 0;
    report.rows.forEach(r => {
      if (r.anomalies.length === 0) clean++;
      else if (r.status === 'error') errors++;
      else warnings++;
    });
    return { total: report.rows.length, clean, warnings, errors };
  };

  const metrics = getMetrics();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Upload and Drag/Drop Zone */}
      {!report && !successSummary && (
        <div className="card" style={{ padding: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>CSV Transaction Import</h3>
          <form onSubmit={handleUpload}>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: dragActive ? '2px dashed var(--primary-color)' : '2px dashed var(--card-border)',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                backgroundColor: dragActive ? 'rgba(108, 99, 255, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                cursor: 'pointer',
                transition: 'border-color 0.2s, background-color 0.2s',
                marginBottom: '20px'
              }}
              onClick={() => document.getElementById('csvFileInput').click()}
            >
              <input
                id="csvFileInput"
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>📄</div>
              <strong style={{ display: 'block', marginBottom: '4px', fontSize: '15px' }}>
                {file ? file.name : 'Drag & Drop your CSV file here'}
              </strong>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'or click to browse from files'}
              </span>
            </div>

            <div className="d-flex justify-between align-center">
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Imports automatically run 14 key anomaly checks (dates, currencies, duplicates).
              </span>
              <button type="submit" className="btn btn-primary" disabled={uploading || !file}>
                {uploading ? 'Analyzing CSV...' : 'Analyze and Review'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading Spinner */}
      {uploading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '60px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid var(--card-border)',
            borderTop: '4px solid var(--primary-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Running anomaly check algorithms...</span>
        </div>
      )}

      {/* Success Summary View */}
      {successSummary && (
        <div className="card" style={{ border: '1.5px solid var(--secondary-color)', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', color: 'var(--secondary-color)', marginBottom: '12px' }}>✓</div>
          <h3 style={{ marginBottom: '8px', fontWeight: '700' }}>Import Completed</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '15px' }}>
            Successfully processed {successSummary.importedRows} of {successSummary.totalRows} transactions.
          </p>
          <button className="btn btn-secondary" onClick={() => setSuccessSummary(null)}>
            Import Another File
          </button>
        </div>
      )}

      {/* Review Section */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Summary Metrics Bar */}
          <div className="card d-flex justify-between align-center" style={{ padding: '16px 24px', flexWrap: 'wrap', gap: '16px' }}>
            <div className="d-flex align-center gap-20">
              <span style={{ fontSize: '14px', fontWeight: '600' }}>{file?.name}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', fontWeight: '600' }}>
                  {metrics.total} rows
                </span>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(0, 212, 170, 0.15)', color: 'var(--secondary-color)', fontWeight: '600' }}>
                  {metrics.clean} clean
                </span>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255, 193, 7, 0.15)', color: '#ffc107', fontWeight: '600' }}>
                  {metrics.warnings} warnings
                </span>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: 'rgba(255, 107, 107, 0.15)', color: 'var(--danger-color)', fontWeight: '600' }}>
                  {metrics.errors} errors
                </span>
              </div>
            </div>

            <div className="d-flex gap-10">
              <button className="btn btn-secondary btn-sm" onClick={selectAllClean}>Select All Clean</button>
              <button className="btn btn-secondary btn-sm" onClick={deselectAllErrors}>Deselect All Errors</button>
              <button className="btn btn-teal btn-sm" onClick={handleConfirm}>
                Confirm Import ({approvedIndices.length} Rows)
              </button>
            </div>
          </div>

          {/* Report Table */}
          <div className="card" style={{ padding: '16px 24px' }}>
            <div className="table-responsive">
              <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>Import</th>
                    <th style={{ width: '60px' }}>Row</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Paid By</th>
                    <th>Split Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => {
                    const isApproved = approvedIndices.includes(row.rowIndex);
                    const isExpanded = expandedRow === row.rowIndex;
                    const clean = row.anomalies.length === 0;
                    
                    let rowColor = 'rgba(255, 255, 255, 0.01)';
                    let badgeColor = 'var(--secondary-color)';
                    let badgeBg = 'rgba(0, 212, 170, 0.1)';
                    let statusText = 'Clean';

                    if (!clean) {
                      if (row.status === 'error') {
                        rowColor = 'rgba(255, 107, 107, 0.03)';
                        badgeColor = 'var(--danger-color)';
                        badgeBg = 'rgba(255, 107, 107, 0.1)';
                        statusText = 'Error';
                      } else {
                        rowColor = 'rgba(255, 193, 7, 0.03)';
                        badgeColor = '#ffc107';
                        badgeBg = 'rgba(255, 193, 7, 0.1)';
                        statusText = 'Warning';
                      }
                    }

                    return (
                      <React.Fragment key={row.rowIndex}>
                        {/* Main row card */}
                        <tr style={{ background: rowColor, transition: 'background-color 0.2s' }}>
                          <td style={{ borderBottom: 'none', borderRadius: '8px 0 0 8px' }}>
                            <input
                              type="checkbox"
                              checked={isApproved}
                              onChange={() => toggleRowSelect(row.rowIndex)}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ borderBottom: 'none', fontWeight: '500' }}>#{row.rowIndex + 1}</td>
                          <td style={{ borderBottom: 'none' }}>{row.parsedRow.date || row.originalRow.date}</td>
                          <td style={{ borderBottom: 'none' }}>
                            <strong style={{ color: '#ffffff' }}>{row.parsedRow.description || row.originalRow.description}</strong>
                          </td>
                          <td style={{ borderBottom: 'none', fontWeight: '700' }}>
                            ₹{row.parsedRow.amount.toFixed(2)}
                            {row.parsedRow.isSettlement && <span style={{ fontSize: '10px', color: 'var(--secondary-color)', display: 'block' }}>(Repayment)</span>}
                            {row.parsedRow.isRefund && <span style={{ fontSize: '10px', color: 'var(--danger-color)', display: 'block' }}>(Refund)</span>}
                          </td>
                          <td style={{ borderBottom: 'none' }}>{row.parsedRow.paid_by || row.originalRow.paid_by || 'Not Specified'}</td>
                          <td style={{ borderBottom: 'none', textTransform: 'capitalize' }}>{row.parsedRow.split_type}</td>
                          <td style={{ borderBottom: 'none' }}>
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: '600',
                              color: badgeColor,
                              backgroundColor: badgeBg
                            }}>
                              {statusText}
                            </span>
                          </td>
                          <td style={{ borderBottom: 'none', borderRadius: '0 8px 8px 0' }}>
                            {!clean && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => toggleRowExpand(row.rowIndex)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                              >
                                {isExpanded ? 'Hide Anomalies' : `View (${row.anomalies.length})`}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expandable anomalies list drawer */}
                        {isExpanded && !clean && (
                          <tr>
                            <td colSpan="9" style={{
                              background: 'rgba(255, 255, 255, 0.01)',
                              borderBottom: 'none',
                              padding: '16px 24px',
                              borderRadius: '8px'
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {row.anomalies.map((anomaly, idx) => (
                                  <div key={idx} style={{
                                    borderLeft: '3px solid var(--primary-color)',
                                    paddingLeft: '14px',
                                    paddingBottom: '4px'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                      <span style={{
                                        fontSize: '10px',
                                        background: 'rgba(108, 99, 255, 0.15)',
                                        color: 'var(--primary-color)',
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        fontWeight: '700'
                                      }}>
                                        {anomaly.type.toUpperCase()}
                                      </span>
                                      <strong style={{ fontSize: '13px', color: '#ffffff' }}>{anomaly.message}</strong>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                      Suggested Fix: <span style={{ color: 'var(--secondary-color)' }}>{anomaly.suggestedFix}</span>
                                    </div>

                                    {/* Show side-by-side original and parsed values */}
                                    <div style={{
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr',
                                      gap: '20px',
                                      background: 'rgba(0, 0, 0, 0.2)',
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      fontSize: '11px'
                                    }}>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Raw Value:</span>
                                        <div style={{ marginTop: '2px', fontFamily: 'monospace' }}>
                                          {JSON.stringify(row.originalRow)}
                                        </div>
                                      </div>
                                      <div>
                                        <span style={{ color: 'var(--text-muted)' }}>Parsed Clean Value:</span>
                                        <div style={{ marginTop: '2px', fontFamily: 'monospace', color: 'var(--secondary-color)' }}>
                                          {JSON.stringify(row.parsedRow)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Past Import History list */}
      <div className="card">
        <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Past Import History logs</h3>
        {historyLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Loading past imports...</p>
        ) : importHistory.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No CSV file imports recorded for this group yet.</p>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Import Date</th>
                  <th>Filename</th>
                  <th>Rows Imported</th>
                  <th>Anomalies Logs</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map(reportLog => (
                  <tr key={reportLog.id}>
                    <td>{new Date(reportLog.createdAt).toLocaleString()}</td>
                    <td>{reportLog.fileName}</td>
                    <td style={{ fontWeight: '600' }}>{reportLog.importedRows} / {reportLog.totalRows}</td>
                    <td>
                      {Array.isArray(reportLog.anomalies) && reportLog.anomalies.length > 0 ? (
                        <details>
                          <summary style={{ cursor: 'pointer', color: 'var(--primary-color)' }}>
                            View ({reportLog.anomalies.length} entries)
                          </summary>
                          <div style={{ fontSize: '11px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', marginTop: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                            {reportLog.anomalies.map((anom, idx) => (
                              <div key={idx} style={{ marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>
                                <strong>Row {anom.rowNumber} [{anom.type}]: </strong> {anom.message}
                                {anom.suggestedFix && <div style={{ color: 'var(--secondary-color)', fontSize: '10px' }}>Fix: {anom.suggestedFix}</div>}
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span className="text-success">No anomalies flagged</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
    </div>
  );
}
