# Vibe Coding Security Checklist

## 01 — Secrets & Config

- [ ] Hardcoded secrets, tokens, or API keys in the codebase
- [ ] Secrets leaking through logs, error messages, or API responses
- [ ] Environment files committed to git
- [ ] API keys exposed client-side that should be server-only
- [ ] CORS too permissive
- [ ] Dependencies with known vulnerabilities
- [ ] Default credentials or example configs still present
- [ ] Debug mode or dev tools enabled in production

---

## 02 — Access & API

- [ ] Pages or routes accessible without proper auth
- [ ] Users accessing other users’ data by changing an ID in the URL
- [ ] Tokens stored insecurely on the client
- [ ] Login or reset flows that reveal whether an account exists
- [ ] Endpoints missing rate limiting
- [ ] Error responses exposing internal details
- [ ] Endpoints returning more data than needed
- [ ] Sensitive actions (delete, change email) with no confirmation step
- [ ] Admin routes protected only by hiding the URL

---

## 03 — User Input

- [ ] Unsanitized input reaching database queries
- [ ] User-submitted text that can run code in other users’ browsers
- [ ] File uploads accepted without type or size checks
- [ ] Payment or billing logic that can be bypassed client-side

90% of vibe coded apps have security issues

Here's the full playbook to fix that :

> Validate everything on the server
> Sanitize before database queries
> Use libraries like Zod or Yup for schema validation
> Create a middleware that checks auth on every protected route
> Don't rely on client-side checks
> Use JWT tokens or session-based auth properly
> API keys, database URLs, tokens go in environment variables
> Never commit .env to GitHub
> Add .env to .gitignore immediately
> Never concatenate user input into SQL
> Use ORMs like Prisma or prepared statements
> Prevents SQL injection attacks
> Prevent brute force attacks
> Limit API calls per user/IP
> Use tools like express-rate-limit or Upstash
> Use bcrypt or argon2
> Never store plain text passwords
> Never use weak hashing like MD5
> Don't use `origin: "*"` in production
> Whitelist specific domains only
> Configure proper HTTP headers
> Use SSL certificates (free with Vercel, Netlify)
> Redirect HTTP to HTTPS
> Enable HSTS headers
> Use CSRF tokens for state-changing operations
> Verify origin headers
> Use SameSite cookie attributes
> Run `npm audit` before deploying
> Update packages with known vulnerabilities
> Use tools like Snyk or Dependabot
