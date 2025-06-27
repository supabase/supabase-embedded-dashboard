"use client";

import { client } from "@/lib/management-api";
import type { components } from "@/lib/management-api-schema";
import { listTablesSql } from "@/lib/pg-meta";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type AxiosError } from "axios";
import { toast } from "sonner";

const getAuthConfig = async (projectRef: string) => {
  const { data, error } = await client.GET("/v1/projects/{ref}/config/auth", {
    params: {
      path: { ref: projectRef },
    },
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useGetAuthConfig = (projectRef: string) => {
  return useQuery({
    queryKey: ["auth-config", projectRef],
    queryFn: () => getAuthConfig(projectRef),
    enabled: !!projectRef,
    retry: false,
  });
};

// UPDATE Auth Config
const updateAuthConfig = async ({
  projectRef,
  payload,
}: {
  projectRef: string;
  payload: components["schemas"]["UpdateAuthConfigBody"];
}) => {
  const { data, error } = await client.PATCH("/v1/projects/{ref}/config/auth", {
    params: {
      path: {
        ref: projectRef,
      },
    },
    body: payload,
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useUpdateAuthConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAuthConfig,
    onSuccess: (data, variables) => {
      toast.success(`Auth config updated.`);
      queryClient.invalidateQueries({
        queryKey: ["auth-config", variables.projectRef],
      });
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(
        error.response?.data?.message ||
          "There was a problem with your request."
      );
    },
  });
};

// RUN SQL Query
const runQuery = async ({
  projectRef,
  query,
  readOnly,
}: {
  projectRef: string;
  query: string;
  readOnly?: boolean;
}) => {
  const { data, error } = await client.POST(
    "/v1/projects/{ref}/database/query",
    {
      params: {
        path: {
          ref: projectRef,
        },
      },
      body: {
        query,
        read_only: readOnly,
      },
    }
  );

  if (error) {
    throw error;
  }

  return data as any;
};

export const useRunQuery = () => {
  return useMutation({
    mutationFn: runQuery,
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(
        error.response?.data?.message || "There was a problem with your query."
      );
    },
  });
};

// LIST Tables
const listTables = ({
  projectRef,
  schemas,
}: {
  projectRef: string;
  schemas?: string[];
}) => {
  const sql = listTablesSql(schemas);
  return runQuery({
    projectRef,
    query: sql,
    readOnly: true,
  });
};

export const useListTables = (projectRef: string, schemas?: string[]) => {
  return useQuery({
    queryKey: ["tables", projectRef, schemas],
    queryFn: () => listTables({ projectRef, schemas }),
    enabled: !!projectRef,
  });
};

// GET Buckets
const getBuckets = async (projectRef: string) => {
  const { data, error } = await client.GET(
    "/v1/projects/{ref}/storage/buckets",
    {
      params: {
        path: {
          ref: projectRef,
        },
      },
    }
  );
  if (error) {
    throw error;
  }

  return data;
};

export const useGetBuckets = (projectRef: string) => {
  return useQuery({
    queryKey: ["buckets", projectRef],
    queryFn: () => getBuckets(projectRef),
    enabled: !!projectRef,
    retry: false,
  });
};

// LIST Objects
const listObjects = async ({
  projectRef,
  bucketId,
}: {
  projectRef: string;
  bucketId: string;
}) => {
  const { data, error } = await client.POST(
    // TODO
    // @ts-expect-error this endpoint is not yet implemented
    "/v1/projects/{ref}/storage/buckets/{bucketId}/objects/list",
    {
      params: {
        path: {
          ref: projectRef,
          bucketId,
        },
      },
      body: {
        path: "",
        options: { limit: 100, offset: 0 },
      },
    }
  );
  if (error) {
    throw error;
  }

  return data as any;
};

export const useListObjects = (projectRef: string, bucketId: string) => {
  return useQuery({
    queryKey: ["objects", projectRef, bucketId],
    queryFn: () => listObjects({ projectRef, bucketId }),
    enabled: !!projectRef && !!bucketId,
  });
};

// GET Logs
const getLogs = async ({
  projectRef,
  iso_timestamp_start,
  iso_timestamp_end,
  sql,
}: {
  projectRef: string;
  iso_timestamp_start?: string;
  iso_timestamp_end?: string;
  sql?: string;
}) => {
  const { data, error } = await client.GET(
    "/v1/projects/{ref}/analytics/endpoints/logs.all",
    {
      params: {
        path: {
          ref: projectRef,
        },
        query: {
          iso_timestamp_start,
          iso_timestamp_end,
          sql,
        },
      },
    }
  );
  if (error) {
    throw error;
  }

  return data;
};

export const useGetLogs = (
  projectRef: string,
  params: {
    iso_timestamp_start?: string;
    iso_timestamp_end?: string;
    sql?: string;
  } = {}
) => {
  const queryKey = ["logs", projectRef, params.sql];

  return useQuery({
    queryKey: queryKey,
    queryFn: () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const queryParams = {
        sql: params.sql,
        iso_timestamp_start:
          params.iso_timestamp_start ?? oneHourAgo.toISOString(),
        iso_timestamp_end: params.iso_timestamp_end ?? now.toISOString(),
      };
      return getLogs({ projectRef, ...queryParams });
    },
    enabled: !!projectRef,
    retry: false,
  });
};

// GET User Counts by day
const getUserCountsByDay = ({
  projectRef,
  days,
}: {
  projectRef: string;
  days: number;
}) => {
  const sql = /* SQL */ `
    WITH days_series AS (
      SELECT generate_series(
        date_trunc('day', now() - interval '${Number(days) - 1} days'),
        date_trunc('day', now()),
        '1 day'::interval
      )::date AS date
    )
    SELECT
      d.date,
      COALESCE(u.users, 0)::int as users
    FROM
      days_series d
    LEFT JOIN (
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date as date,
        count(id) as users
      FROM
        auth.users
      GROUP BY 1
    ) u ON d.date = u.date
    ORDER BY
      d.date ASC;
  `;

  return runQuery({
    projectRef,
    query: sql,
    readOnly: true,
  });
};

export const useGetUserCountsByDay = (projectRef: string, days: number) => {
  return useQuery({
    queryKey: ["user-counts", projectRef, days],
    queryFn: () => getUserCountsByDay({ projectRef, days }),
    enabled: !!projectRef,
    retry: false,
  });
};

// GET Suggestions
const getSuggestions = async (projectRef: string) => {
  const [
    { data: performanceData, error: performanceError },
    { data: securityData, error: securityError },
  ] = await Promise.all([
    client.GET("/v1/projects/{ref}/advisors/performance", {
      params: {
        path: {
          ref: projectRef,
        },
      },
    }),
    client.GET("/v1/projects/{ref}/advisors/security", {
      params: {
        path: {
          ref: projectRef,
        },
      },
    }),
  ]);
  if (performanceError) {
    throw performanceError;
  }
  if (securityError) {
    throw securityError;
  }

  // Add type to each suggestion
  const performanceLints = (performanceData?.lints || []).map((lint) => ({
    ...lint,
    type: "performance" as const,
  }));
  const securityLints = (securityData?.lints || []).map((lint) => ({
    ...lint,
    type: "security" as const,
  }));
  return [...performanceLints, ...securityLints];
};

export const useGetSuggestions = (projectRef: string) => {
  return useQuery({
    queryKey: ["suggestions", projectRef],
    queryFn: () => getSuggestions(projectRef),
    enabled: !!projectRef,
    retry: false,
  });
};

// GET Secrets
const getSecrets = async (projectRef: string) => {
  const { data, error } = await client.GET("/v1/projects/{ref}/secrets", {
    params: {
      path: {
        ref: projectRef,
      },
    },
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useGetSecrets = (projectRef: string) => {
  return useQuery({
    queryKey: ["secrets", projectRef],
    queryFn: () => getSecrets(projectRef),
    enabled: !!projectRef,
    retry: false,
  });
};

// CREATE Secrets
const createSecrets = async ({
  projectRef,
  secrets,
}: {
  projectRef: string;
  secrets: components["schemas"]["CreateSecretBody"];
}) => {
  const { data, error } = await client.POST("/v1/projects/{ref}/secrets", {
    params: {
      path: {
        ref: projectRef,
      },
    },
    body: secrets,
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useCreateSecrets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSecrets,
    onSuccess: (data, variables) => {
      toast.success(`Secrets created successfully.`);
      queryClient.refetchQueries({
        queryKey: ["secrets", variables.projectRef],
      });
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(
        error.response?.data?.message ||
          "There was a problem with your request."
      );
    },
  });
};

// DELETE Secrets
const deleteSecrets = async ({
  projectRef,
  secretNames,
}: {
  projectRef: string;
  secretNames: string[];
}) => {
  const { data, error } = await client.DELETE("/v1/projects/{ref}/secrets", {
    params: {
      path: {
        ref: projectRef,
      },
    },
    body: secretNames,
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useDeleteSecrets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSecrets,
    onSuccess: (data, variables) => {
      toast.success(`Secrets deleted successfully.`);
      queryClient.invalidateQueries({
        queryKey: ["secrets", variables.projectRef],
      });
    },
    onError: (error: AxiosError<{ message: string }>) => {
      toast.error(
        error.response?.data?.message ||
          "There was a problem with your request."
      );
    },
  });
};

// GET Snippets
const getSnippets = async ({
  projectRef,
  cursor,
  limit,
  sort_by,
  sort_order,
}: {
  projectRef?: string;
  cursor?: string;
  limit?: string;
  sort_by?: "inserted_at" | "name";
  sort_order?: "asc" | "desc";
}) => {
  const { data, error } = await client.GET("/v1/snippets", {
    params: {
      query: {
        cursor,
        limit,
        sort_by,
        sort_order,
        project_ref: projectRef,
      },
    },
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useGetSnippets = (
  params: {
    projectRef?: string;
    cursor?: string;
    limit?: string;
    sort_by?: "inserted_at" | "name";
    sort_order?: "asc" | "desc";
  } = {}
) => {
  return useQuery({
    queryKey: ["snippets", params],
    queryFn: () => getSnippets(params),
    retry: false,
    enabled: !!params.projectRef, // Only fetch when projectRef is available
  });
};

// GET Single Snippet
const getSnippet = async (id: string) => {
  const { data, error } = await client.GET("/v1/snippets/{id}", {
    params: {
      path: {
        id,
      },
    },
  });
  if (error) {
    throw error;
  }

  return data;
};

export const useGetSnippet = (id: string) => {
  return useQuery({
    queryKey: ["snippet", id],
    queryFn: () => getSnippet(id),
    enabled: !!id,
    retry: false,
  });
};
