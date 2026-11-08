UPDATE advising_requests
SET advisor_email = (
  SELECT users.advisor_email
  FROM users
  WHERE users.id = advising_requests.student_id
)
WHERE advisor_email IS NULL
  AND EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = advising_requests.student_id
      AND users.advisor_email IS NOT NULL
  );
