begin;

update storage.buckets
set file_size_limit = 20971520
where id = 'quote-request-files';

commit;
