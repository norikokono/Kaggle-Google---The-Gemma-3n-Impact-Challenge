// Offline DB utilities (IndexedDB/localStorage stub)
//
// Plant flammability and advice information sources:
// - U.S. Forest Service: https://www.fs.usda.gov/
// - National Fire Protection Association (NFPA): https://www.nfpa.org/
// - Firewise USA: https://www.nfpa.org/firewise
// - CAL FIRE: https://www.fire.ca.gov/
// - Colorado State University Extension: https://extension.colostate.edu/topic-areas/natural-resources/firewise-plant-materials-6-305/
//
// Advice is summarized and adapted for clarity and practical use in this app.

const PLANT_INFO = {
  "Ponderosa Pine": {
    flammability: "high-flammability species",
    advice: "Consider clearing it from defensible spaces. Maintain a 30-foot buffer and remove fallen needles regularly."
  },
  "Sagebrush": {
    flammability: "moderate-flammability shrub",
    advice: "Trim back sagebrush near structures and keep the area free of dry leaves and twigs."
  },
  "Cheatgrass": {
    flammability: "very high-flammability invasive grass",
    advice: "Remove cheatgrass early in the season before it dries out. Replace with native, fire-resistant ground cover."
  },
  "Oak": {
    flammability: "low-flammability deciduous tree (when green)",
    advice: "Keep dry leaves raked and away from buildings. Prune dead branches and maintain healthy growth."
  },
  "Juniper": {
    flammability: "high-flammability shrub",
    advice: "Avoid planting juniper close to homes. Prune lower branches and keep the area clear of debris."
  },
  "Manzanita": {
    flammability: "high-flammability shrub",
    advice: "Thin manzanita stands and remove dead wood. Maintain defensible space by spacing plants apart."
  }
};

let logs = [];

export const getPlantInfo = async (plantName) => {
  return PLANT_INFO[plantName] || {flammability: "unknown", advice: "No advice available."};
};

export const logObservation = async (observation) => {
  logs.push({...observation, timestamp: Date.now(), synced: false});
};

export const getUnsyncedLogs = async () => logs.filter(l => !l.synced);
export const markLogsAsSynced = async (syncedLogs) => {
  logs = logs.map(l => syncedLogs.includes(l) ? {...l, synced: true} : l);
};
