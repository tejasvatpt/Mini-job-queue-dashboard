# **Mini Job Queue Dashboard**

Hi! I built this project for the React + NestJS intern assignment. It is a full-stack dashboard for managing background jobs, with strict backend state machine transitions, atomic concurrency handling, and validation.

---

## **Live Links**

- **Frontend:** https://mini-job-queue-frontend.onrender.com/
- **Backend API:** https://mini-job-queue-backend.onrender.com/jobs
- **GitHub Repository:** https://github.com/tejasvatpt/Mini-job-queue-dashboard

---

## **Project Setup (Running Locally)**

If you want to run this locally on your machine, here is the quick setup:

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/tejasvatpt/Mini-job-queue-dashboard.git
   cd Mini-job-queue-dashboard
   cd backend && npm install && cd ../frontend && npm install && cd ..
   ```

2. **Database & Environment:**
   - Make sure PostgreSQL is running (or run `docker-compose up -d`).
   - Create `backend/.env` with your `DATABASE_URL` (see `backend/.env.example`).
   - Push schema and seed data: `cd backend && npx prisma db push && npm run db:seed`.

3. **Start Development Servers:**
   - Backend: `cd backend && npm run start:dev` (runs on `http://localhost:3000`)
   - Frontend: `cd frontend && npm run dev` (runs on `http://localhost:5173`)

---

## **Tech Stack**

- **Frontend:** React 18, TypeScript, Vite, Plain CSS (no UI libraries)
- **Backend:** NestJS 12, TypeScript
- **Database & ORM:** PostgreSQL 16 (hosted on Neon), Prisma 6
- **Testing:** Vitest, Supertest

---

## **Core Engineering Decisions & Concurrency**

The assignment asked a few key questions around state management and concurrency. Here is how I approached and solved each one:

### **1. Where should the transition rule be enforced?**
I enforced all transition rules strictly on the **backend** inside `JobsService`. 

While I also disabled invalid buttons in the React UI (for good user experience), I treated client-side checks as purely cosmetic. In a real system, the client can never be trusted, so the backend and database act as the ultimate authority.

### **2. What happens if someone bypasses React and calls the API directly?**
The exact same rules apply. 

Even if someone calls the API directly through Postman or a script, the request still hits the backend first. The backend validates the input and checks if the transition is allowed. If someone tries an invalid jump like `pending -> completed`, the backend immediately rejects it with an error. Bypassing the UI doesn't bypass the rules.

### **3. What happens when two requests arrive at nearly the same time?**
To handle race conditions without over-engineering with distributed locks or Redis, I used an **atomic conditional update** at the database layer using Prisma's `updateMany`:

```sql
UPDATE jobs
SET status = 'running'
WHERE id = $1 AND status = 'pending';
```

Because PostgreSQL serializes writes, both requests cannot win:
- **Request A** matches the row where `status = 'pending'`, updates it to `running`, and succeeds with `count = 1`.
- **Request B** arrives a millisecond later. Since the status is now already `running`, it matches 0 rows (`count = 0`).
- My service detects that 0 rows were updated, checks the current state of the job, and responds with a clean **`409 Conflict`** ("Job was already updated by another request").

### **4. How I prevented an invalid or inconsistent state**
I implemented a 3-layer defense system:
1. **DTO Validation:** Rejects invalid payloads before they hit the service layer.
2. **Application State Machine:** Ensures transitions only move `pending -> running -> completed / failed`.
3. **Database-level Protection:** The atomic compound `WHERE` query ensures two simultaneous requests never corrupt the data.

---

## **Bonus: Making the System More Production-Ready**

### **PostgreSQL Native Enum for `JobStatus`**

For the bonus requirement, I created a native PostgreSQL database enum in `schema.prisma`:

```sql
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');
```

**Why I chose this:**
Most beginners just store status as a plain string (`VARCHAR`) and rely completely on TypeScript. I wanted a final database-level guarantee. Even if a developer makes a typo in backend code, or someone executes a manual SQL script trying to write `'done'` or `'canceled'`, PostgreSQL will physically reject the write with a type error. It also stores values internally as 4-byte integers, making index scans and storage much more efficient.

---

## **Assumptions & Trade-offs I Made**

- **`type` is free-form:** The prompt didn't specify fixed job categories, so I allowed non-empty strings up to 100 characters.
- **No authentication:** Left out auth and user roles as specified in the assignment to keep the scope focused.
- **Refetch after mutations:** In React, after creating, updating, or deleting a job, I fetch the updated list from the server rather than doing complex optimistic UI updates. This slightly increases network calls, but it guarantees the UI is always 100% in sync with the database.
- **Single database instance instead of Redis:** Instead of adding extra infrastructure like Redis or distributed lock managers to handle race conditions, I used PostgreSQL's built-in atomic update (`UPDATE jobs ... WHERE status = 'pending'`). It completely prevents double-updates at the database level without unnecessary complexity.

---

## **What I Would Add With More Time**

If I were taking this to a full-scale production environment, I would add:
1. **Actual Background Job Execution:** Right now, the app tracks and updates job statuses in the database. In a real production system, I would connect a queue (like BullMQ) so background workers actually perform the real work (such as sending an email or generating a PDF) when a job moves to running.
2. **Real-Time Live Updates (WebSockets / SSE):** So when a background job completes, the dashboard automatically updates on the screen without having to refresh the page.
3. **Pagination:** Loading jobs in smaller batches (e.g., 20 at a time) so the page remains fast even with thousands of jobs in the database.
4. **Automatic Retries for Failed Jobs:** If a job fails due to a temporary network hiccup or timeout, the system should automatically try running it again 2 or 3 times before giving up and marking it permanently as failed.


