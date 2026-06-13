import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getGroups, createGroup } from '../services/api';

/**
 * Main dashboard view listing all groups the authenticated user belongs to.
 */
export default function Dashboard() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchGroupsList = async () => {
    try {
      const data = await getGroups();
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load groups list', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroupsList();
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    setError(null);
    setCreating(true);

    try {
      await createGroup(newGroupName.trim());
      setNewGroupName('');
      setShowModal(false);
      fetchGroupsList();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-between align-center" style={{ marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Your Groups</h1>
          <p style={{ color: 'var(--text-muted)' }}>Split bills, manage shared balances, and track settlements.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + Create Group
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <h3>Loading your groups...</h3>
        </div>
      ) : groups.length === 0 ? (
        <div className="card text-center" style={{ padding: '60px 40px' }}>
          <h3 style={{ marginBottom: '12px' }}>No Groups Found</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            You aren't a member of any expense sharing groups yet.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Create your first group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ height: '100%', minHeight: '160px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '8px', color: '#ffffff' }}>
                    {group.name}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Created on {new Date(group.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: 'var(--primary-color)', fontWeight: '600' }}>
                    View Details &rarr;
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showModal && (
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
          <div className="card" style={{ width: '90%', maxWidth: '450px', transform: 'none' }}>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Create New Group</h3>
            
            {error && (
              <div style={{ padding: '12px', background: 'rgba(255, 107, 107, 0.1)', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '13px', marginBottom: '16px' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label htmlFor="groupName">Group Name</label>
                <input
                  id="groupName"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Apartment 402, Trip to Goa"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="d-flex justify-between" style={{ gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
