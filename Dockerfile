# Base image
FROM node:12.8.0

# Creating a directory inside the base image and defining as the base directory
WORKDIR /app

# Copying the files of the root directory into the base directory
ADD . /app

# Set TimeZone correctly
ENV TZ=America/New_York
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

ENV NODE_ENV=production

# Installing the project dependencies
RUN npm install

# Starting the pm2 process and keeping the docker container alive
CMD npm start

# Exposing the RestAPI port
EXPOSE 3000
