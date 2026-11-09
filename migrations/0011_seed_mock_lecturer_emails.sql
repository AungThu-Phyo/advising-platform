UPDATE lecturer_profiles SET email = CASE uid
  WHEN 'digital-technology-1' THEN 'thanawat.saelim@mfu.ac.th'
  WHEN 'digital-technology-2' THEN 'kanya.phromsri@mfu.ac.th'
  WHEN 'digital-technology-3' THEN 'pakorn.intarawong@mfu.ac.th'
  WHEN 'digital-technology-4' THEN 'wichai.boonmee@mfu.ac.th'
  WHEN 'digital-technology-5' THEN 'lalita.meesuk@mfu.ac.th'
  WHEN 'health-sciece-1' THEN 'supansa.khamkaen@mfu.ac.th'
  WHEN 'health-sciece-2' THEN 'waranya.sae-tang@mfu.ac.th'
  WHEN 'health-sciece-3' THEN 'chanon.preecha@mfu.ac.th'
  WHEN 'health-sciece-4' THEN 'napassorn.kittisak@mfu.ac.th'
  WHEN 'health-sciece-5' THEN 'teerapat.sornchai@mfu.ac.th'
  WHEN 'management-1' THEN 'anan.chaiyasit@mfu.ac.th'
  WHEN 'management-2' THEN 'pimchanok.rattanaporn@mfu.ac.th'
  WHEN 'management-3' THEN 'narin.wongsa@mfu.ac.th'
  WHEN 'management-4' THEN 'kittipong.suksan@mfu.ac.th'
  WHEN 'management-5' THEN 'siriporn.kaewmanee@mfu.ac.th'
  ELSE email
END
WHERE email IS NULL AND uid IN (
  'digital-technology-1', 'digital-technology-2', 'digital-technology-3',
  'digital-technology-4', 'digital-technology-5', 'health-sciece-1',
  'health-sciece-2', 'health-sciece-3', 'health-sciece-4', 'health-sciece-5',
  'management-1', 'management-2', 'management-3', 'management-4', 'management-5'
);
