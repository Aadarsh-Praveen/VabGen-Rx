-- app schema: doctor login accounts.
-- Was the Node.js "credentials" database's single `users` table.

create table if not exists app.users (
    id                   bigint generated always as identity primary key,
    hospital_id          text,
    licence_no           text,
    name                 text,
    designation          text,
    department           text,
    dob                  date,
    age                  integer,
    sex                  text,
    address              text,   -- may hold a JSON-stringified value written by /api/profile/update-address; kept as text since the app never parses it back
    contact_no           text,
    email                text not null unique,
    password             text not null,  -- bcrypt hash
    password_changed_at  timestamptz
);
