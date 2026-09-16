import React, { useState, useEffect, useCallback } from 'react';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type FilterStatus = JobStatus | 'all';

export interface Job {
  id: string;
  title: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) {
        errorMsg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {}
    const err = new Error(errorMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }
  return res.json();
}

const jobsApi = {
  getJobs: (status?: FilterStatus) => {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    return apiRequest<Job[]>(`/jobs${query}`);
  },
  createJob: (payload: { title: string; type: string }) => {
    return apiRequest<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateJobStatus: (id: string, status: JobStatus) => {
    return apiRequest<Job>(`/jobs/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
  deleteJob: (id: string) => {
    return apiRequest<void>(`/jobs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

function StatusCounts({ jobs }: { jobs: Job[] }) {
  const counts = {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    running: jobs.filter((j) => j.status === 'running').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
  };

  return (
    <div className="status-counts">
      <div className="count-badge count-total">
        <span className="count-number">{counts.total}</span>
        <span className="count-label">Total</span>
      </div>
      <div className="count-badge count-pending">
        <span className="count-number">{counts.pending}</span>
        <span className="count-label">Pending</span>
      </div>
      <div className="count-badge count-running">
        <span className="count-number">{counts.running}</span>
        <span className="count-label">Running</span>
      </div>
      <div className="count-badge count-completed">
        <span className="count-number">{counts.completed}</span>
        <span className="count-label">Completed</span>
      </div>
      <div className="count-badge count-failed">
        <span className="count-number">{counts.failed}</span>
        <span className="count-label">Failed</span>
      </div>
    </div>
  );
}

function JobForm({
  onSubmit,
}: {
  onSubmit: (payload: { title: string; type: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedType = type.trim();

    if (!trimmedTitle) {
      setFormError('Job title is required.');
      return;
    }
    if (!trimmedType) {
      setFormError('Job type is required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ title: trimmedTitle, type: trimmedType });
      setTitle('');
      setType('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create job.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="job-form">
      <h2 className="section-title">Create New Job</h2>
      <div className="job-form__fields">
        <input
          type="text"
          className="input"
          placeholder="Job title (e.g., Export Monthly Sales)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting}
          maxLength={200}
        />
        <input
          type="text"
          className="input"
          placeholder="Type (e.g., report, email, sync)"
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={submitting}
          maxLength={100}
        />
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Job'}
        </button>
      </div>
      {formError && <div className="form-error">{formError}</div>}
    </form>
  );
}

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
];

function StatusFilter({
  current,
  onChange,
}: {
  current: FilterStatus;
  onChange: (status: FilterStatus) => void;
}) {
  return (
    <div className="status-filter">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`filter-btn ${current === opt.value ? 'filter-btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function JobCard({
  job,
  onStatusUpdate,
  onDelete,
}: {
  job: Job;
  onStatusUpdate: (id: string, status: JobStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  async function handleUpdate(nextStatus: JobStatus) {
    setUpdating(true);
    setConflictError(null);
    try {
      await onStatusUpdate(job.id, nextStatus);
    } catch (err: any) {
      if (
        err?.status === 409 ||
        err?.message?.toLowerCase().includes('conflict') ||
        err?.message?.toLowerCase().includes('another request')
      ) {
        setConflictError('Job status was changed by another request. Please refresh.');
      } else {
        setConflictError(err instanceof Error ? err.message : 'Update failed.');
      }
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete job "${job.title}"?`)) return;
    setUpdating(true);
    try {
      await onDelete(job.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed.');
      setUpdating(false);
    }
  }

  const formattedDate = new Date(job.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="job-card">
      <div className="job-card__info">
        <div className="job-card__title" title={job.title}>
          {job.title}
        </div>
        <div className="job-card__type">{job.type}</div>
        <div>
          <span className={`badge badge--${job.status}`}>{job.status}</span>
        </div>
        <div className="job-card__date">{formattedDate}</div>
        <div className="job-card__actions">
          {job.status === 'pending' && (
            <button
              className="btn btn--action btn--running"
              onClick={() => handleUpdate('running')}
              disabled={updating}
            >
              Start
            </button>
          )}
          {job.status === 'running' && (
            <>
              <button
                className="btn btn--action btn--completed"
                onClick={() => handleUpdate('completed')}
                disabled={updating}
              >
                Complete
              </button>
              <button
                className="btn btn--action btn--failed"
                onClick={() => handleUpdate('failed')}
                disabled={updating}
              >
                Fail
              </button>
            </>
          )}
          <button
            className="btn btn--action btn--delete"
            onClick={handleDelete}
            disabled={updating}
          >
            Delete
          </button>
        </div>
      </div>
      {conflictError && <div className="job-card__conflict">{conflictError}</div>}
    </div>
  );
}

function JobList({
  jobs,
  loading,
  error,
  onStatusUpdate,
  onDelete,
}: {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  onStatusUpdate: (id: string, status: JobStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (loading && jobs.length === 0) {
    return (
      <div className="job-list-state">
        <p className="state-message">Loading jobs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="job-list-state job-list-state--error">
        <p className="state-message">{error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="job-list-state">
        <p className="state-message state-message--empty">No jobs found.</p>
      </div>
    );
  }

  return (
    <div className="job-list">
      <div className="job-list__header">
        <span>Title</span>
        <span>Type</span>
        <span>Status</span>
        <span>Created At</span>
        <span>Actions</span>
      </div>
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onStatusUpdate={onStatusUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await jobsApi.getJobs(filterStatus);
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  function handleFilterChange(next: FilterStatus) {
    setLoading(true);
    setFilterStatus(next);
  }

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await jobsApi.getJobs(filterStatus);
        if (!ignore) {
          setJobs(data);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch jobs.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [filterStatus]);

  async function handleCreate(payload: { title: string; type: string }) {
    await jobsApi.createJob(payload);
    await fetchJobs();
  }

  async function handleStatusUpdate(id: string, status: JobStatus) {
    try {
      await jobsApi.updateJobStatus(id, status);
    } finally {
      await fetchJobs();
    }
  }

  async function handleDelete(id: string) {
    await jobsApi.deleteJob(id);
    await fetchJobs();
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Mini Job Queue Dashboard</h1>
      </header>

      <main className="app-main">
        <section className="section">
          <StatusCounts jobs={jobs} />
        </section>

        <section className="section">
          <JobForm onSubmit={handleCreate} />
        </section>

        <section className="section">
          <h2 className="section-title">Filter by Status</h2>
          <StatusFilter current={filterStatus} onChange={handleFilterChange} />
        </section>

        <section className="section">
          <h2 className="section-title">
            Jobs {!loading && <span className="section-count">({jobs.length})</span>}
          </h2>
          <JobList
            jobs={jobs}
            loading={loading}
            error={error}
            onStatusUpdate={handleStatusUpdate}
            onDelete={handleDelete}
          />
        </section>
      </main>
    </div>
  );
}
