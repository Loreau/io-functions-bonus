import { Context } from "@azure/functions";

const saveDsuActivity = async (context: Context, input: unknown) => {
  context.log.info(`SaveDSUActivity|INFO|Input: ${input}`);
  return true;
};

export default saveDsuActivity;