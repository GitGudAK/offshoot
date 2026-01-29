FROM nginx:alpine

# Copy static files
COPY index.html /usr/share/nginx/html/
COPY index.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY modules/ /usr/share/nginx/html/modules/
COPY assets/ /usr/share/nginx/html/assets/

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
