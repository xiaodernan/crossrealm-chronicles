FROM eclipse-temurin:21-jre
COPY discovery-server/target/discovery-server-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8761
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
