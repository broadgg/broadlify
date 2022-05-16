import { defineEndpoint } from "@directus/extensions-sdk";
import { isCustomError } from "./types";

const saveEmail = async (email: string) => {
  // Save email to a DB
  console.log("email", email)
};

const validateEmail = (email?: string) => {
  if (!email || email.length === 0)
    throw {
      statusCode: 400,
      message: "Invalid input",
    };
};

export default defineEndpoint((router) => {
  router.post("/", async (req, res) => {
    const { email } = req.body;

    try {
      // ValidateEmail
      validateEmail(email);
      // Write email into database
      await saveEmail(email);
      res.status(200).send("Email saved");
    } catch (error) {
      if (isCustomError(error)) {
        res.status(error.statusCode).send(error.message);
      } else {
        res.status(500).send("Internal server error");
      }
    }
  });
});
