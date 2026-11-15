FROM eclipse-temurin:21-jre
COPY ai-service/target/ai-service-0.1.0-SNAPSHOT.jar /app/app.jar
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
