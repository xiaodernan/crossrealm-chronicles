FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
COPY config-server/target/config-server-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8888
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
