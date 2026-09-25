FROM nginx:alpine

# Render (und ähnliche Hosts) geben den Port über $PORT vor
ENV PORT=10000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html /usr/share/nginx/html/

EXPOSE 10000
