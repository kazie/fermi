ALTER TABLE questions ADD COLUMN template_id TEXT;
ALTER TABLE questions ADD COLUMN template_slot TEXT;
UPDATE questions SET
  template_id = json_extract(data, '$.template.id'),
  template_slot = json_extract(data, '$.template.slot');
CREATE INDEX questions_template ON questions (template_id);
