import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  getGroup,
  getUsers,
  addMember,
  updateMember,
  getExpenses,
  createExpense,
  deleteExpense,
  getBalances,
  getUserBreakdown,
  getSettlements,
  createSettlement
} from '../services/api';
import ImportCSV from './ImportCSV';

/**
 * Detailed view of a single group containing tabs for Expenses, Balances, Settlements, and CSV Imports.
 */
export default function GroupDetail() {
  const { id } = useParams();
  const { user: currentUser } = useContext(AuthContext);

  // Core state
  const [group, setGroup] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balancesData, setBalancesData] = useState({ balances: [], simplifiedDebts: [] });
  const [settlements, setSettlements] = useState([]);
  const [activeTab, setActiveTab] = useState('expenses');
  const [loading, setLoading] = useState(true);

  // Modal / Form States
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [joinDate, setJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [memberError, setMemberError] = useState(null);

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseData, setExpenseData] = useState({
    description: '',
    amount: '',
    currency: 'INR',
    splitType: 'equal',
    date: new Date().toISOString().split('T')[0],
    paidById: '',
    notes: '',
    splitWith: {} // maps userId -> { amount, percentage, shares, included: true }
  });
  const [expenseError, setExpenseError] = useState(null);

  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    paidById: '',
    paidToId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [settlementError, setSettlementError] = useState(null);

  // User breakdown details drawer
  const [breakdownUser, setBreakdownUser] = useState(null);
  const [userBreakdownData, setUserBreakdownData] = useState([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Fetch group data and child arrays
  const loadGroupDetails = async () => {
    try {
      const gData = await getGroup(id);
      setGroup(gData.group);

      const usersData = await getUsers();
      setAllUsers(usersData.users || []);

      const expData = await getExpenses(id);
      setExpenses(expData.expenses || []);

      const balData = await getBalances(id);
      setBalancesData(balData);

      const setList = await getSettlements(id);
      setSettlements(setList.settlements || []);

    } catch (err) {
      console.error('Failed to load group details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupDetails();
  }, [id]);

  // Initializing paidById / splitWith on members load
  useEffect(() => {
    if (group && group.members && group.members.length > 0) {
      // Set default paidById
      setExpenseData(prev => ({
        ...prev,
        paidById: prev.paidById || group.members[0].userId.toString()
      }));

      // Initialize splitWith for all members
      const initialSplits = {};
      group.members.forEach(m => {
        initialSplits[m.userId] = {
          userId: m.userId,
          included: true,
          amount: '',
          percentage: '',
          shares: '1'
        };
      });
      setExpenseData(prev => ({
        ...prev,
        splitWith: initialSplits
      }));

      // Initialize settlement dropdowns
      setSettlementForm(prev => ({
        ...prev,
        paidById: group.members[0].userId.toString(),
        paidToId: group.members[1] ? group.members[1].userId.toString() : group.members[0].userId.toString()
      }));
    }
  }, [group]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setMemberError(null);
    try {
      await addMember(id, parseInt(selectedUserId), joinDate);
      setShowMemberModal(false);
      setSelectedUserId('');
      loadGroupDetails();
    } catch (err) {
      setMemberError(err.response?.data?.error || 'Failed to add member.');
    }
  };

  const handleMarkAsLeft = async (userId) => {
    if (!window.confirm('Are you sure you want to mark this user as having left the group?')) return;
    try {
      await updateMember(id, userId, new Date().toISOString());
      loadGroupDetails();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update membership status.');
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setExpenseError(null);

    const amountNum = parseFloat(expenseData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setExpenseError('Please enter a valid amount.');
      return;
    }

    // Format splits according to selected split type
    const splitWithArray = [];
    const splitsObj = expenseData.splitWith;

    for (const userId in splitsObj) {
      const split = splitsObj[userId];
      if (split.included) {
        const item = { userId: parseInt(userId) };
        if (expenseData.splitType === 'exact') {
          item.amount = parseFloat(split.amount || 0);
        } else if (expenseData.splitType === 'percentage') {
          item.percentage = parseFloat(split.percentage || 0);
        } else if (expenseData.splitType === 'share') {
          item.shares = parseFloat(split.shares || 0);
        }
        splitWithArray.push(item);
      }
    }

    if (splitWithArray.length === 0) {
      setExpenseError('Must split with at least one group member.');
      return;
    }

    const payload = {
      description: expenseData.description,
      amount: amountNum,
      currency: expenseData.currency,
      splitType: expenseData.splitType,
      date: expenseData.date,
      paidById: parseInt(expenseData.paidById),
      splitWith: splitWithArray,
      notes: expenseData.notes || null
    };

    try {
      await createExpense(id, payload);
      setShowExpenseForm(false);
      // Reset form description/amount
      setExpenseData(prev => ({ ...prev, description: '', amount: '', notes: '' }));
      loadGroupDetails();
    } catch (err) {
      setExpenseError(err.response?.data?.error || 'Failed to record expense.');
    }
  };

  const handleDeleteExpense = async (expId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteExpense(id, expId);
      loadGroupDetails();
    } catch (err) {
      alert('Failed to delete expense.');
    }
  };

  const handleSettlementSubmit = async (e) => {
    e.preventDefault();
    setSettlementError(null);
    
    const amountNum = parseFloat(settlementForm.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setSettlementError('Please enter a valid amount.');
      return;
    }

    if (settlementForm.paidById === settlementForm.paidToId) {
      setSettlementError('Cannot record settlement between the same user.');
      return;
    }

    try {
      await createSettlement(id, {
        paidById: parseInt(settlementForm.paidById),
        paidToId: parseInt(settlementForm.paidToId),
        amount: amountNum,
        date: settlementForm.date,
        notes: settlementForm.notes || null
      });
      setShowSettlementForm(false);
      setSettlementForm(prev => ({ ...prev, amount: '', notes: '' }));
      loadGroupDetails();
    } catch (err) {
      setSettlementError(err.response?.data?.error || 'Failed to record settlement.');
    }
  };

  const handleUserClick = async (member) => {
    setBreakdownUser(member);
    setBreakdownLoading(true);
    try {
      const data = await getUserBreakdown(id, member.userId);
      setUserBreakdownData(data.breakdown || []);
    } catch (err) {
      console.error(err);
    } finally {
      setBreakdownLoading(false);
    }
  };



  if (loading) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '100px' }}>
        <h2>Loading Group Details...</h2>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="card text-center" style={{ padding: '40px' }}>
        <h2>Group Not Found</h2>
        <p style={{ marginTop: '16px' }}><Link to="/">Back to Dashboard</Link></p>
      </div>
    );
  }

  return (
    <div>
      {/* Group Header Info */}
      <div style={{ marginBottom: '32px' }}>
        <Link to="/" style={{ fontSize: '14px', marginBottom: '8px', display: 'inline-block' }}>&larr; Back to Dashboard</Link>
        <h1 style={{ fontSize: '36px', fontWeight: '800', color: '#ffffff' }}>{group.name}</h1>
      </div>

      <div className="grid grid-cols-3" style={{ alignItems: 'start' }}>
        {/* Left Side: Members List Panel */}
        <div className="card" style={{ gridColumn: 'span 1' }}>
          <div className="d-flex justify-between align-center" style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Members</h3>
            <button className="btn btn-primary btn-sm" onClick={() => { setMemberError(null); setShowMemberModal(true); }}>
              + Add
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {group.members.map(member => (
              <div key={member.userId} className="d-flex justify-between align-center" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{member.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Joined: {new Date(member.joinedAt).toLocaleDateString()}
                    {member.leftAt && ` | Left: ${new Date(member.leftAt).toLocaleDateString()}`}
                  </div>
                </div>

                {!member.leftAt && (
                  <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => handleMarkAsLeft(member.userId)}>
                    Left
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Tab Navigation Content Area */}
        <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="tabs">
            <button className={`tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>Expenses</button>
            <button className={`tab ${activeTab === 'balances' ? 'active' : ''}`} onClick={() => setActiveTab('balances')}>Balances</button>
            <button className={`tab ${activeTab === 'settlements' ? 'active' : ''}`} onClick={() => setActiveTab('settlements')}>Settlements</button>
            <button className={`tab ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>Import CSV</button>
          </div>

          {/* 1. EXPENSES TAB */}
          {activeTab === 'expenses' && (
            <div>
              <div className="d-flex justify-between align-center" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Expenses Journal</h3>
                {!showExpenseForm && (
                  <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)}>
                    + Add Expense
                  </button>
                )}
              </div>

              {showExpenseForm && (
                <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--primary-color)' }}>
                  <h4 style={{ marginBottom: '16px', fontWeight: '700' }}>Record New Expense</h4>
                  
                  {expenseError && (
                    <div style={{ padding: '12px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '13px', marginBottom: '16px' }}>
                      {expenseError}
                    </div>
                  )}

                  <form onSubmit={handleExpenseSubmit}>
                    <div className="grid grid-cols-2">
                      <div className="form-group">
                        <label htmlFor="expDesc">Description</label>
                        <input id="expDesc" type="text" className="form-control" placeholder="e.g. Groceries" value={expenseData.description} onChange={(e) => setExpenseData({...expenseData, description: e.target.value})} required />
                      </div>

                      <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                        <div>
                          <label htmlFor="expAmt">Amount</label>
                          <input id="expAmt" type="number" step="any" className="form-control" placeholder="0.00" value={expenseData.amount} onChange={(e) => setExpenseData({...expenseData, amount: e.target.value})} required />
                        </div>
                        <div>
                          <label htmlFor="expCur">Currency</label>
                          <select id="expCur" className="form-control" value={expenseData.currency} onChange={(e) => setExpenseData({...expenseData, currency: e.target.value})}>
                            <option value="INR">INR (₹)</option>
                            <option value="USD">USD ($)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3">
                      <div className="form-group">
                        <label htmlFor="expPayer">Paid By</label>
                        <select id="expPayer" className="form-control" value={expenseData.paidById} onChange={(e) => setExpenseData({...expenseData, paidById: e.target.value})}>
                          {group.members.filter(m => !m.leftAt).map(m => (
                            <option key={m.userId} value={m.userId}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="expDate">Date</label>
                        <input id="expDate" type="date" className="form-control" value={expenseData.date} onChange={(e) => setExpenseData({...expenseData, date: e.target.value})} required />
                      </div>

                      <div className="form-group">
                        <label htmlFor="expSplitType">Split Type</label>
                        <select id="expSplitType" className="form-control" value={expenseData.splitType} onChange={(e) => setExpenseData({...expenseData, splitType: e.target.value})}>
                          <option value="equal">Split Equally</option>
                          <option value="exact">Exact Amounts</option>
                          <option value="percentage">Percentages</option>
                          <option value="share">Shares / Weights</option>
                        </select>
                      </div>
                    </div>

                    {/* Dynamic Split Inputs */}
                    <div style={{ marginTop: '10px', marginBottom: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                      <h5 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>Split details</h5>
                      
                      {group.members.map(member => {
                        const sState = expenseData.splitWith[member.userId] || { included: true };

                        return (
                          <div key={member.userId} className="d-flex align-center gap-20" style={{ marginBottom: '12px', justifyContent: 'space-between' }}>
                            <div className="checkbox-group" style={{ marginBottom: 0 }}>
                              <input
                                id={`inc-${member.userId}`}
                                type="checkbox"
                                checked={sState.included}
                                onChange={(e) => {
                                  const updated = { ...expenseData.splitWith };
                                  updated[member.userId].included = e.target.checked;
                                  setExpenseData({ ...expenseData, splitWith: updated });
                                }}
                              />
                              <label htmlFor={`inc-${member.userId}`}>{member.name}</label>
                            </div>

                            {sState.included && expenseData.splitType !== 'equal' && (
                              <div style={{ width: '120px' }}>
                                {expenseData.splitType === 'exact' && (
                                  <input
                                    type="number"
                                    step="any"
                                    className="form-control"
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    placeholder="Amount"
                                    value={sState.amount || ''}
                                    onChange={(e) => {
                                      const updated = { ...expenseData.splitWith };
                                      updated[member.userId].amount = e.target.value;
                                      setExpenseData({ ...expenseData, splitWith: updated });
                                    }}
                                    required
                                  />
                                )}
                                {expenseData.splitType === 'percentage' && (
                                  <input
                                    type="number"
                                    step="any"
                                    className="form-control"
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    placeholder="%"
                                    value={sState.percentage || ''}
                                    onChange={(e) => {
                                      const updated = { ...expenseData.splitWith };
                                      updated[member.userId].percentage = e.target.value;
                                      setExpenseData({ ...expenseData, splitWith: updated });
                                    }}
                                    required
                                  />
                                )}
                                {expenseData.splitType === 'share' && (
                                  <input
                                    type="number"
                                    className="form-control"
                                    style={{ padding: '6px 10px', fontSize: '12px' }}
                                    placeholder="Shares"
                                    value={sState.shares || '1'}
                                    onChange={(e) => {
                                      const updated = { ...expenseData.splitWith };
                                      updated[member.userId].shares = e.target.value;
                                      setExpenseData({ ...expenseData, splitWith: updated });
                                    }}
                                    required
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {expenseData.splitType === 'percentage' && (() => {
                      const total = Object.values(expenseData.splitWith)
                        .filter(s => s.included)
                        .reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);
                      const isValid = Math.abs(total - 100) < 0.01;
                      return (
                        <div style={{ fontSize: '13px', padding: '8px 12px', borderRadius: '8px', marginTop: '4px', background: isValid ? 'rgba(0, 212, 170, 0.1)' : 'rgba(255, 107, 107, 0.1)', color: isValid ? 'var(--secondary-color)' : 'var(--danger-color)', fontWeight: '600' }}>
                          Percentage Total: {total.toFixed(1)}% {isValid ? '✓' : `(must equal 100%)`}
                        </div>
                      );
                    })()}

                    <div className="form-group">
                      <label htmlFor="expNotes">Notes</label>
                      <input id="expNotes" type="text" className="form-control" placeholder="Optional notes" value={expenseData.notes} onChange={(e) => setExpenseData({...expenseData, notes: e.target.value})} />
                    </div>

                    <div className="d-flex justify-between" style={{ gap: '12px', marginTop: '24px' }}>
                      <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowExpenseForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                        Record Expense
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No expenses recorded yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {expenses.map(exp => (
                    <div key={exp.id} className="card" style={{ padding: '16px 20px' }}>
                      <div className="d-flex justify-between align-center">
                        <div>
                          <h4 style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>{exp.description}</h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Paid by <strong style={{ color: '#ffffff' }}>{exp.paidBy.name}</strong> on {new Date(exp.date).toLocaleDateString()}
                            <span style={{ marginLeft: '8px', fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(108, 99, 255, 0.15)', color: 'var(--primary-color)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {exp.splitType}
                            </span>
                          </p>
                        </div>

                        <div className="d-flex align-center gap-20">
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--secondary-color)' }}>
                              ₹{exp.amount.toFixed(2)}
                            </div>
                            {exp.currency !== 'INR' && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                ({exp.currency === 'USD' ? '$' : ''}{exp.originalAmount.toFixed(2)})
                              </div>
                            )}
                          </div>

                          <button className="btn btn-danger btn-sm" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => handleDeleteExpense(exp.id)}>
                            Delete
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px' }}>
                        <strong>Splits: </strong>
                        {exp.splits.map((s, idx) => (
                          <span key={s.id}>
                            {s.user.name} (₹{s.amount.toFixed(2)}){idx < exp.splits.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                        {exp.notes && (
                          <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '4px' }}>
                            <em>Note: {exp.notes}</em>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. BALANCES TAB */}
          {activeTab === 'balances' && (
            <div>
              <div className="d-flex justify-between align-center" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Group Balances</h3>
                {!showSettlementForm && (
                  <button className="btn btn-teal" onClick={() => setShowSettlementForm(true)}>
                    Record Settlement
                  </button>
                )}
              </div>

              {showSettlementForm && (
                <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--secondary-color)' }}>
                  <h4 style={{ marginBottom: '16px', fontWeight: '700' }}>Record Cash Repayment</h4>
                  
                  {settlementError && (
                    <div style={{ padding: '12px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '13px', marginBottom: '16px' }}>
                      {settlementError}
                    </div>
                  )}

                  <form onSubmit={handleSettlementSubmit}>
                    <div className="grid grid-cols-3">
                      <div className="form-group">
                        <label htmlFor="setFrom">From (Payer)</label>
                        <select id="setFrom" className="form-control" value={settlementForm.paidById} onChange={(e) => setSettlementForm({...settlementForm, paidById: e.target.value})}>
                          {group.members.map(m => (
                            <option key={m.userId} value={m.userId}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="setTo">To (Recipient)</label>
                        <select id="setTo" className="form-control" value={settlementForm.paidToId} onChange={(e) => setSettlementForm({...settlementForm, paidToId: e.target.value})}>
                          {group.members.map(m => (
                            <option key={m.userId} value={m.userId}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor="setAmt">Repayment Amount (₹)</label>
                        <input id="setAmt" type="number" step="any" className="form-control" placeholder="0.00" value={settlementForm.amount} onChange={(e) => setSettlementForm({...settlementForm, amount: e.target.value})} required />
                      </div>
                    </div>

                    <div className="grid grid-cols-2">
                      <div className="form-group">
                        <label htmlFor="setDate">Date</label>
                        <input id="setDate" type="date" className="form-control" value={settlementForm.date} onChange={(e) => setSettlementForm({...settlementForm, date: e.target.value})} required />
                      </div>

                      <div className="form-group">
                        <label htmlFor="setNotes">Notes</label>
                        <input id="setNotes" type="text" className="form-control" placeholder="Optional notes" value={settlementForm.notes} onChange={(e) => setSettlementForm({...settlementForm, notes: e.target.value})} />
                      </div>
                    </div>

                    <div className="d-flex justify-between" style={{ gap: '12px', marginTop: '24px' }}>
                      <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSettlementForm(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-teal" style={{ flex: 1 }}>
                        Submit Repayment
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Net Balances list */}
              <div className="grid grid-cols-2" style={{ marginBottom: '24px' }}>
                {balancesData.balances.map(bal => {
                  const isCreditor = bal.netBalance > 0;
                  const isZero = Math.abs(bal.netBalance) <= 0.01;
                  return (
                    <div
                      key={bal.userId}
                      className="card"
                      style={{ padding: '16px 20px', cursor: 'pointer', border: breakdownUser?.userId === bal.userId ? '1.5px solid var(--primary-color)' : '' }}
                      onClick={() => handleUserClick(bal)}
                    >
                      <div className="d-flex justify-between align-center">
                        <strong style={{ color: '#ffffff' }}>{bal.userName}</strong>
                        <span className={isZero ? 'text-muted' : isCreditor ? 'text-success' : 'text-danger'} style={{ fontWeight: '700', fontSize: '18px' }}>
                          {isZero ? 'Settled Up' : `${isCreditor ? '+' : ''}₹${bal.netBalance.toFixed(2)}`}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'right' }}>
                        Click to view breakdown &rarr;
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Simplified Debts */}
              <div className="card">
                <h4 style={{ marginBottom: '16px', fontWeight: '700' }}>Simplified Repayments</h4>
                {balancesData.simplifiedDebts.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Everyone is fully settled up! No repayments required.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {balancesData.simplifiedDebts.map((debt, index) => (
                      <div key={index} className="d-flex align-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: '14px' }}>
                          <strong style={{ color: 'var(--danger-color)' }}>{debt.fromName}</strong> owes <strong style={{ color: 'var(--secondary-color)' }}>{debt.toName}</strong>
                        </div>
                        <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--primary-color)' }}>
                          ₹{debt.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* User itemized breakdown section */}
              {breakdownUser && (
                <div className="card" style={{ marginTop: '24px', border: '1px solid var(--card-border)' }}>
                  <div className="d-flex justify-between align-center" style={{ marginBottom: '16px' }}>
                    <h4 style={{ fontWeight: '700' }}>Breakdown for {breakdownUser.userName}</h4>
                    <button className="btn btn-secondary btn-sm" onClick={() => setBreakdownUser(null)}>Close</button>
                  </div>

                  {breakdownLoading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading breakdown details...</p>
                  ) : userBreakdownData.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No transactions found for this user.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {userBreakdownData.map((item, idx) => (
                        <div key={idx} className="d-flex justify-between align-center" style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '600' }}>
                              {item.type === 'expense' ? `Expense: ${item.description}` : item.description}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {new Date(item.date).toLocaleDateString()} | Paid by: {item.paidByName}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span className={item.netEffect >= 0 ? 'text-success' : 'text-danger'} style={{ fontWeight: '700' }}>
                              {item.netEffect >= 0 ? '+' : ''}₹{item.netEffect.toFixed(2)}
                            </span>
                            {item.type === 'expense' && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                share: ₹{item.shareAmount.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. SETTLEMENTS TAB */}
          {activeTab === 'settlements' && (
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>Settlements History</h3>
              {settlements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No settlements recorded yet.
                </div>
              ) : (
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Amount</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map(set => (
                        <tr key={set.id}>
                          <td>{new Date(set.date).toLocaleDateString()}</td>
                          <td style={{ color: 'var(--danger-color)', fontWeight: '600' }}>{set.paidBy.name}</td>
                          <td style={{ color: 'var(--secondary-color)', fontWeight: '600' }}>{set.paidTo.name}</td>
                          <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>₹{set.amount.toFixed(2)}</td>
                          <td>{set.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 4. IMPORT TAB */}
          {activeTab === 'import' && (
            <ImportCSV groupId={id} onImportSuccess={loadGroupDetails} />
          )}
        </div>
      </div>

      {/* Add Member Modal Dialog */}
      {showMemberModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 10, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000
        }}>
          <div className="card" style={{ width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Add Member to Group</h3>
            
            {memberError && (
              <div style={{ padding: '12px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '13px', marginBottom: '16px' }}>
                {memberError}
              </div>
            )}

            <form onSubmit={handleAddMember}>
              <div className="form-group">
                <label htmlFor="selectUser">Select User</label>
                <select id="selectUser" className="form-control" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} required>
                  <option value="">-- Select Registered User --</option>
                  {allUsers.filter(u => !group.members.some(m => m.userId === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="joinDate">Join Date</label>
                <input id="joinDate" type="date" className="form-control" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} required />
              </div>

              <div className="d-flex justify-between" style={{ gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowMemberModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
