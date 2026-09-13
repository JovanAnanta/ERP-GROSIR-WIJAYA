FROM postgres:18-alpine AS runtime

RUN apk add --no-cache restic tzdata

COPY backup-crontab /etc/crontabs/root
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY backup-db.sh /usr/local/bin/backup-db
COPY restore-db.sh /usr/local/bin/restore-db
RUN chmod 0755 /usr/local/bin/entrypoint.sh /usr/local/bin/backup-db /usr/local/bin/restore-db

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
