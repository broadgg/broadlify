import { defineHook } from "@directus/extensions-sdk";

const onSuccess = (value: number) => {
  console.log("Update success", value);
};

const onFailure = (reason: any) => {
  console.log("Update failed", reason);
};

export default defineHook(({ schedule }, context) => {
  schedule("*/15 * * * *", async () => {
    const { database, getSchema } = context;

    const schema = await getSchema();

    try {
      database.transaction(async (t) => {
        for (const collectionName in schema.collections) {
          if (!collectionName.includes("directus")) {
            if (await database.schema.hasColumn(collectionName, "status")) {
              t(collectionName)
                .where({ status: "draft" })
                .update({ status: "published" })
                .then(onSuccess, onFailure)
                .catch(t.rollback);
            }
          }
        }
      });
    } catch (error) {
      console.error(error);
    }
  });
});
